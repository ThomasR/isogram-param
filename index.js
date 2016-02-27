/*!
* Copyright 2016 Thomas Rosenau
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

'use strict';

const esprima = require('esprima');
const estraverse = require('estraverse');
const escodegen = require('escodegen');
const escope = require('escope');

const util = require('./lib/util');

/**
* Variable name replacer:
*   function(e,t,n,o,a,d,r,l,c,i,s,u){
* ->
*   function(i,s,o,g,r,a,m,_,P,R,A,M){
*/
module.exports = (input, target, raw) => {
    // create syntax tree and scope analysis
    let ast = esprima.parse(input);
    var scopes = escope.analyze(ast).scopes;

    // Determine global identifiers.
    let globalNames = scopes.filter(scope => scope.implicit && scope.implicit.left).reduce((result, scope) => {
        let found = scope.implicit.left.map(global => global.identifier.name);
        return result.concat(found);
    }, []);
    globalNames.forEach(global => {
        if (global.length === 1 && target.indexOf(global) > -1) {
            // This is too dangerous
            throw new Error(`Cannot replace global variable "${global}"`);
        }
    });

    // get local variables (AST nodes)
    let locals = scopes.reduce((result, scope) => {
        scope.variables.filter(v => v.name !== 'arguments').forEach(variable => {
            if (result.indexOf(variable) === -1) {
                result.push(variable);
            }
        });
        return result;
    }, []);

    // replace a node's variable name by the given letter
    // Also replace all occurrences of the same variable in the whole tree
    let replaceName = (variable, letter) => {
        if (variable.name === letter) {
            return;
        }
        //console.log(`replacing ${variable.name} -> ${letter}`);
        let ids = variable.references.map(r => r.identifier).concat(variable.identifiers).concat([variable]);
        ids.forEach(id => id.name = letter);
    };

    // carry out the replacement
    let targetLetters = target.split('');
    targetLetters.forEach((letter, i) => {
        let candidate = locals[i];
        if (!candidate) {
            throw new Error('Not enough variables to replace');
        }
        replaceName(candidate, letter);
        let taken = locals.map(l => l.name).concat(globalNames).concat(targetLetters);
        let freeLetter = util.getFreeLetter(taken);
        locals.forEach(local => {
            if (local !== candidate && local.name === letter) {
                replaceName(local, freeLetter);
            }
        });
    });

    if (raw) {
        return ast;
    }

    // serialize result
    return escodegen.generate(ast, {
        format: {
            compact: true,
            quotes: 'double',
            semicolons: false
        }
    });
};
