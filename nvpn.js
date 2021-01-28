#!/usr/bin/env node
const { program } = require('commander');
const inquirer = require('inquirer');
const speakeasy = require('speakeasy');
const execa = require('execa');
const fs = require('fs-extra');
const path = require('path');
const tmp = require('tmp');
const os = require('os');

const configFileName = '.nvpnrc';
const configFilePath = path.resolve(os.homedir(), configFileName);

(async() => {
  try {
    const {
      connectionName,
      secretBase32,
      passwordStaticPart
    } = await fileExists(configFilePath) ? await readConfig() : await createConfig();

    if (await active(connectionName)) {
      await disconnect(connectionName);
    }
    else {
      await connect(connectionName, combinePassword(secretBase32, passwordStaticPart));
    }
  }
  catch (e) {
    console.error('Something went wrong...');
    console.error(e);
  }
})();

async function createConfig() {
  const answers = await inquirer.prompt([{
    name: 'connectionName',
    message: 'VPN connection name:',
    validate: value => !!value
  }, {
    name: 'secretBase32',
    message: 'Secret (base32):',
    validate: value => !!value
  }, {
    name: 'passwordStaticPart',
    message: 'Password static part:',
    validate: value => !!value
  }]);
  const { connectionName, secretBase32, passwordStaticPart } = answers;
  await fs.writeJson(configFilePath, {
    connectionName,
    secretBase32,
    passwordStaticPart
  }, {
    encoding: 'utf-8',
    spaces: 2
  });
  return { connectionName, secretBase32, passwordStaticPart };
}

async function readConfig() {
  const { connectionName, secretBase32, passwordStaticPart } = await fs.readJson(configFilePath);
  return { connectionName, secretBase32, passwordStaticPart };
}

function combinePassword(secretBase32, passwordStaticPart) {
  const token = speakeasy.totp({ secret: secretBase32, encoding: 'base32' });
  return `${passwordStaticPart}${token}`;
}

async function active(connectionName) {
  const cmd = await execute('nmcli', [
    '-f',
    'GENERAL.STATE',
    'connection',
    'show',
    connectionName
  ]);
  return /^GENERAL.STATE:\s+activated$/.test(cmd.stdout);
}

async function connect(connectionName, password) {
  const passwordFileContents = `vpn.secrets.password:${password}`;
  const passwordFilePath = tmp.tmpNameSync({ prefix: 'nvpn' });
  try {
    await fs.writeFile(passwordFilePath, passwordFileContents, { encoding: 'utf-8' });
    await execute('nmcli', [
      'connection',
      'up',
      'id',
      connectionName,
      'passwd-file',
      passwordFilePath
    ], {
      stdout: true,
      stderr: true
    });
  }
  finally {
    if (await fileExists(passwordFilePath)) {
      await fs.remove(passwordFilePath);
    }
  }
}

async function disconnect(connectionName) {
  await execute('nmcli', [
    'connection',
    'down',
    'id',
    connectionName
  ], {
    stdout: true,
    stderr: true
  });
}

async function execute(command, args, options = {}) {
  const { stdout = false, stderr = false } = options;
  const cmd = execa(command, args);
  if (stdout) {
    cmd.stdout.pipe(process.stdout);
  }
  if (stderr) {
    cmd.stderr.pipe(process.stderr);
  }
  await cmd;
  return cmd;
}

async function fileExists(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  }
  catch (e) {
    return false;
  }
}
