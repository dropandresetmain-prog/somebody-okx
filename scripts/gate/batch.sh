#!/bin/bash
# usage: batch.sh <model-label> <first> <last>
for i in $(seq $2 $3); do node scripts/gate/run-objective.mjs $1-$i 45 > /tmp/$1-$i.log 2>&1; done
