#!/bin/bash
tusd -upload-dir /Users/fasolo97/tusfiles -hooks-http http://localhost:3010/uploadVideoResumable -hooks-enabled-events pre-create,post-finish
