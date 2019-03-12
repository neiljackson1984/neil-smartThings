#!/bin/bash
# -*- mode:sh -*-

die() {
    echo >&2 "$*"
    exit 1
}



cleanup() {
    rm -f "$tmpfile"
}
trap cleanup  EXIT INT QUIT TERM

# Run older ld (pseudo condition)

if [ "$#" == "0" ];  then
    profile=default
elif [ "$#" == "1"  ]; then
    profile=$1
else
    die "usage $0 [profile]"
fi;


extract_cookies() {

    if [ "$#" -ge 1 ]; then
        sqlfile="$1"
    else
        if tty -s; then
        sqlfile=$(ls -t ~/.mozilla/firefox/*/cookies.sqlite | head -1)

        sqlfile="-"     # Will use 'cat' below to read stdin
        fi
    fi

    if [ "$sqlfile" != "-" -a ! -r "$sqlfile" ]; then
        echo "Error. File $sqlfile is not readable." >&2
        exit 1
    fi

    # We have to copy cookies.sqlite, because FireFox has a lock on it
    cat "$sqlfile" >> $tmpfile


    # This is the format of the sqlite database:
    # CREATE TABLE moz_cookies (id INTEGER PRIMARY KEY, name TEXT, value TEXT, host TEXT, path TEXT,expiry INTEGER, lastAccessed INTEGER, isSecure INTEGER, isHttpOnly INTEGER);

    echo "# Netscape HTTP Cookie File"
    sqlite3 -separator $'\t' $tmpfile <<- EOF
.mode tabs
.header off
select host,
case substr(host,1,1)='.' when 0 then 'FALSE' else 'TRUE' end,
path,
case isSecure when 0 then 'FALSE' else 'TRUE' end,
expiry,
name,
value
from moz_cookies;
EOF

    cleanup

}

tmpfile="$(mktemp /tmp/cookies.sqlite.XXXXXXXXXX)"
curlcookies="$(mktemp /tmp/curlcookies.XXXXXXXXXX)"

pathOfFirefoxProfilesFolder=`cygpath --absolute "${APPDATA}/Mozilla/Firefox/Profiles"`

#use the profile folder with the most recent timestamp (thanks to https://unix.stackexchange.com/questions/136976/get-the-latest-directory-not-the-latest-file)
#this spits out the folder with the newest timestamp within the firefox profiles folder, possibly with one or two trailing slashes.
pathOfFirefoxProfile=`ls -td -- ${pathOfFirefoxProfilesFolder}/*/ | head -n 1`
echo pathOfFirefoxProfile: ${pathOfFirefoxProfile}
#this strips th trailing slashes
pathOfFirefoxProfile=${pathOfFirefoxProfile%%/}
echo pathOfFirefoxProfile: ${pathOfFirefoxProfile}
pathOfFirefoxCookieDatabaseFile=${pathOfFirefoxProfile}/cookies.sqlite
echo pathOfFirefoxProfilesFolder: ${pathOfFirefoxProfilesFolder}

echo pathOfFirefoxCookieDatabaseFile: ${pathOfFirefoxCookieDatabaseFile}


echo $pathOfFirefoxCookieDatabaseFile | { read cookie_file ;
extract_cookies "$cookie_file" ;
}


