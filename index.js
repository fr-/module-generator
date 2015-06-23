#!/usr/bin/env node

var semver = require('semver')
var chalk = require('chalk')
var npm = require('npm')
var varName = require('variable-name')
var prompt   = require('inquirer').prompt
var readdirp = require('readdirp')
var mkdirp   = require('mkdirp')
var conf     = require('npmconf')
var xtend    = require('xtend')
var dotty    = require('dotty')
var path     = require('path')
var fs       = require('fs')
var escape = require('js-string-escape')

var argv = require('yargs')
      .alias('u', 'user')
      .describe('u', 'an organization override for GitHub URLs')
      .argv

var target = process.cwd()

var TEST_RUNNER = 'tape'

getParams(function(err, params) {
  if (err) throw err

  readdirp({
    root: path.join(__dirname, 'templates')
  }).on('data', function(file) {
    var dest = path.resolve(target, file.path)

    if (file.path === 'index.js' || file.path === '_test.js')
      return

    if (fs.existsSync(dest)) {
      return console.log('ignoring: ' + file.path)
    }

    fs.readFile(file.fullPath, 'utf8', function(err, content) {
      if (err) throw err

      content = render(content, params)
      dest = render(dest, params)

      if (file.name.match(/\.json$/g)) {
        content = JSON.stringify(JSON.parse(content), null, 2)
      }

      if (file.name.match(/\_\.gitignore$/g)) 
        dest = dest.replace('_.gitignore', '.gitignore')
      else if (file.name.match(/\_\.npmignore$/g))
        dest = dest.replace('_.npmignore', '.npmignore')
      else if (file.name === '_test.js')
        dest = dest.replace('_test.js', 'test.js')

      mkdirp(path.dirname(dest), function(err) {
          if(err) throw err
          fs.writeFile(dest, content)
      });
    })
  })
})

function render(template, params) {
  return template.replace(/\{\{([^}]+)}}/g, function(_, name) {
    return dotty.get(params, name)
  })
}

function getParams(done) {
  conf.load({}, function(err, config) {
    if (err) return done(err)

    var data = {
      user: {
          name: "xymatic"
        , site: "http://delight-engine.com"
        , email: "connect@xymatic.com"
        , username: config.get('username')
      }
    }

    if (typeof argv.u === 'string') {
      data.org = { name: argv.u, }
      console.log(chalk.green('Creating module under organization '+chalk.bold(data.org.name)))
    } else if (argv.u) {
      return done('--user specified, but without an organization!')
    }

    //default org to user
    if (!data.org) {
      data.org = {
        name: data.user.name,
      }
    }

    prompt([
      {
          'name': 'name'
        , 'message': 'Module name'
        , 'default': path.basename(target)
      },
      {
          'name': 'description'
        , 'message': 'Module description'
      },
      {
          'name': 'tags'
        , 'message': 'Module tags:'
      },
      {
          'name': 'stability'
        , 'type': 'list'
        , 'message': 'Module stability:'
        , 'default': 'experimental'
        , 'choices': [
            'deprecated'
          , 'experimental'
          , 'unstable'
          , 'stable'
          , 'frozen'
          , 'locked'
        ]
      }
    ], function(results) {
      if (err) return done(err)

      results.name = dequote(results.name)
      results.testDescription = escape(results.description).replace(/\\"+/g, '\"')
      results.description = dequote(results.description)
      results.varName = varName(results.name)
      results.tags = JSON.stringify(results.tags.split(' ').map(function(str) {
        return dequote(str).trim()
      }).filter(Boolean), null, 4)
      done(null, xtend(results, data))
    })
  })
}

function handleInstall(callback) {
  npm.load({
      saveDev: true
  }, function(err) {
      npm.commands.install([TEST_RUNNER], function(err, data) {
          if (!err) {
            data = data[data.length-1][0]
            data = data.split('@')
          }

          if (callback) 
            callback(err, data)
      });
      npm.on("log", function(message) {
          console.log(message);
      });
  });
}

function bail(cmd) {
  console.log('')
  console.log('Missing configuration option, please run the following using your own value:')
  console.log('')
  console.log('  > ' + cmd)
  console.log('')
}

function dequote(str) {
  return str.replace(/\"+/g, '\\"')
}
