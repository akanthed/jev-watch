#!/usr/bin/env node
"use strict";

const { main } = require("../dist/index.js");

main(process.argv)
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
