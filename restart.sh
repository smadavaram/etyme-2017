#!/usr/bin/env bash
set -ex

bundle exec cap production deploy:restart
