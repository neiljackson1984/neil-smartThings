#this makefile expects to be called from another makefile, with the variable "sources" already defined.
# sources is the list of .groovy files to be processed.
# We expect that for each file x.groovy, there is a file x.deployinfo, a json file containing the information required by the deploy script.
# sources:=personal-logger.driver.groovy personal-logger.app.groovy

getFullyQualifiedWindowsStylePath=$(shell cygpath --windows --absolute "$(1)")
unslashedDir=$(patsubst %/,%,$(dir $(1)))
pathOfThisMakefile:=$(call unslashedDir,$(lastword $(MAKEFILE_LIST)))
pathOfDeployScript:=../../../deploy/deploy.py
venv:=$(shell cd "$(abspath $(dir ${pathOfDeployScript}))" > /dev/null 2>&1; pipenv --venv || echo initializeVenv)
# buildDirectory:=${pathOfThisMakefile}/build
buildDirectory:=build
credentialsDirectory:=${buildDirectory}/credentials
# groovyFile:=$(firstword $(wildcard *.groovy))
# sources:=$(wildcard *.groovy)

preprocessedGroovyFiles:=$(foreach source,$(sources),$(buildDirectory)/$(source))

# deployInfoFile:=$(firstword $(wildcard *.deployinfo))
uploadTargets:=$(foreach source,$(sources),$(buildDirectory)/$(source).upload)

.PHONY: initializeVenv

default: $(uploadTargets)
	# @echo "====== BUILDING $@ from $^ ======= "
	@echo -ne "\n"

# .PHONY: $(uploadTargets)
#see https://stackoverflow.com/questions/3095569/why-are-phony-implicit-pattern-rules-not-triggered?newreg=6306c4bba39e4bbe86512274947e4692
#see https://www.gnu.org/software/make/manual/html_node/Static-Usage.html#Static-Usage
$(uploadTargets): $(buildDirectory)/%.groovy.upload: $(buildDirectory)/%.groovy %.deployinfo |  ${buildDirectory}  ${venv}
	@echo "====== DEPLOYING $*.groovy ======= "
	cd "$(abspath $(dir ${pathOfDeployScript}))"; \
	pipenv run python "$(notdir ${pathOfDeployScript})" \
	    --source="$(shell cygpath --absolute --mixed "$(buildDirectory)/$*.groovy")" \
	    --deploy_info_file="$(shell cygpath --absolute --mixed "$*.deployinfo")" \
		--credentials_directory="$(shell cygpath --absolute --mixed "$(credentialsDirectory)")"
	touch "$@"
	@echo "====== FINISHED DEPLOYING $*.groovy ======= "
	@echo -ne "\n"

terminalBackslashReplacement:=c01a360518214dbf968ccbb383e14601


$(preprocessedGroovyFiles): $(buildDirectory)/%.groovy : %.groovy  |  ${buildDirectory}  ${venv}
	#TODO: run $*.groovy through the c preprocessor (or similar) to produced $(buildDirectory)/$*.groovy
	# cp $*.groovy $(buildDirectory)/$*.groovy
	# cpp -P -w $*.groovy -o "$(buildDirectory)/$*.groovy"
	# cpp -w -P -C -E -traditional $*.groovy -o "$(buildDirectory)/$*.groovy"
	# here is a very hacky way to preserve the escaped newlines (i.e. backslash followed by a newline), which cpp otherwise tenaciously removes:
	# replace a backslash at the end of a line by a bogus (but hopefully globally unique) string, then after preprocessing, replace the bogus string at the end of a line by a backslash. (Yuck, but it gets the job done.)
	# The last sed call gets rid of carriage returns at the end of lines, which cpp tends to insert, even if the original file contained no carriage returns (yuck!). (this is a hack to suit a perticular case where the original file did not have carriage returns and 
	# I do not want to modify the orignal file more than is necessary.
	cat $*.groovy \
		| sed --regexp-extended 's/\\$$/$(terminalBackslashReplacement)/g' \
		| cpp -w -P -C -E -traditional \
		| sed --regexp-extended 's/$(terminalBackslashReplacement)/\\/g' \
		| sed --regexp-extended 's/\r$$//g'  \
		> "$(buildDirectory)/$*.groovy"
	cpp -M $*.groovy 
	#note: cpp strips comments, so the generated artifact will not really be suitable for human consumption.
	# fortuantely, cpp does not delete the lines, even if the only content of a line is a comment.
	# therefore, line numbers after comment stripping will correspond to line numbers before comment stripping.
	# Oops: I was mistaken.  cpp replaces each comment with a single space.
	# To acheive the desired comment-preservation behavior, I need the "-C" option.

# cpp options: 
#
# -P inhibit generation of line markers in the output. Line markers are
# something that is specifially designed for the C compiler chain, and which we
# do not want here because we are not working with C code.
#
# -w suppress warning messages
#
# -C Do not discard comments: pass them through to the output file. Comments
# appearing in arguments of a macro call will be copied to the output before the
# expansion of the macro call. 
#
# -E  Stop after the preprocessing stage; do not run the compiler proper. The
# output is in the form of preprocessed source code, which is sent to the
# standard output. 

${venv}: $(dir ${pathOfDeployScript})Pipfile $(dir ${pathOfDeployScript})Pipfile.lock
	@echo "====== INITIALIZING VIRTUAL ENVIRONMENT ======= "
	@echo "target: $@"
	cd "$(abspath $(dir ${pathOfDeployScript}))"; pipenv install
	touch $(shell cd "$(abspath $(dir ${pathOfDeployScript}))" > /dev/null 2>&1; pipenv --venv)
	@echo -ne "\n"

.SILENT:

${buildDirectory}:
	@echo "====== CREATING THE BUILD FOLDER ======="
	@echo "buildDirectory: ${buildDirectory}"
	mkdir --parents "${buildDirectory}"
	@echo -ne "\n"


# 	@echo "====== BUILDING $@ from $^ ======= "
# 	@echo -ne "target (\$$@):                    "; echo "$@"
# 	@echo -ne "all prerequisites (\$$^):         "; echo "$^"
# 	@echo -ne "order-only prerequisites (\$$|):  "; echo "$|"
# 	@echo -ne "\n"
# @echo "====== BUILDING $@ from $^ ======= "
# @echo -ne "target (\$$@):                    "; echo "$@"
# @echo -ne "\$$(basename \$$@):                 "; echo $(basename $@)
# @echo -ne "\$$(basename \$$(basename \$$@)):     "; echo $(basename $(basename $@))
# @echo -ne "deployinfo file:                "; echo $(basename $(basename $@)).deployinfo
# @echo -ne "all prerequisites (\$$^):         "; echo "$^"
# @echo -ne "order-only prerequisites (\$$|):  "; echo "$|"
# @echo -ne "groovy file:                    "; echo "$<"

# @echo "====== BUILDING $@ from $^ ======= "
# @echo -ne "target (\$$@):                    "; echo "$@"
# @echo -ne "\$$(basename \$$@):                 "; echo $(basename $@)
# @echo -ne "\$$(basename \$$(basename \$$@)):     "; echo $(basename $(basename $@))
# @echo -ne "deployinfo file:                "; echo $(basename $(basename $@)).deployinfo
# @echo -ne "all prerequisites (\$$^):         "; echo "$^"
# @echo -ne "order-only prerequisites (\$$|):  "; echo "$|"
# @echo -ne "groovy file:                    "; echo "$<"
# @echo -ne "groovy file:                    "; echo "$*.groovy"
# @echo -ne "deployinfo file:                "; echo "$*.deployinfo"