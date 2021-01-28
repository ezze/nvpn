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

program
  .command('toggle', { isDefault: true })
  .description('Toggle VPN connection')
  .action(toggle);
program
  .command('init')
  .description(`Create configuration file "${configFileName}" in user's home directory`)
  .action(init);
program
  .command('connect')
  .description('Establish VPN connection')
  .action(connect);
program
  .command('disconnect')
  .description('Interrupt VPN connection')
  .action(disconnect);
program.parse(process.argv);

async function toggle() {
  try {
    const {
      connectionName,
      secretBase32,
      passwordStaticPart
    } = await fileExists(configFilePath) ? await readConfig() : await createConfig();
    if (await isConnectionActive(connectionName)) {
      await interruptConnection(connectionName);
    }
    else {
      await establishConnection(connectionName, combinePassword(secretBase32, passwordStaticPart));
    }
    console.log(`Connection "${connectionName}" has been toggled.`);
  }
  catch (e) {
    console.error('Unable to toggle a connection.');
    console.error(e);
  }
}

async function init() {
  try {
    await createConfig();
    console.log('Configuration file is created successfully.');
  }
  catch (e) {
    console.error('Unable to create configuration file.');
    console.error(e);
  }
}

async function connect() {
  try {
    const { connectionName, secretBase32, passwordStaticPart } = await readConfig();
    if (await isConnectionActive(connectionName)) {
      console.warn(`Connection "${connectionName}" is already established.`);
      return;
    }
    await establishConnection(connectionName, combinePassword(secretBase32, passwordStaticPart));
    console.log(`Connection "${connectionName}" has been established.`);
  }
  catch (e) {
    console.error('Unable to establish a connection.');
    console.error(e);
  }
}

async function disconnect() {
  try {
    const { connectionName } = await readConfig();
    if (!await isConnectionActive(connectionName)) {
      console.warn(`Connection "${connectionName}" is not established.`);
      return;
    }
    await interruptConnection(connectionName);
    console.log(`Connection "${connectionName}" has been interrupted.`);
  }
  catch (e) {
    console.error('Unable to interrupt a connection.');
    console.error(e);
  }
}

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
  if (!await fileExists(configFilePath)) {
    return Promise.reject(`Configuration file "${configFilePath}" doesn't exist.`);
  }
  const { connectionName, secretBase32, passwordStaticPart } = await fs.readJson(configFilePath);
  return { connectionName, secretBase32, passwordStaticPart };
}

function combinePassword(secretBase32, passwordStaticPart) {
  const token = speakeasy.totp({ secret: secretBase32, encoding: 'base32' });
  return `${passwordStaticPart}${token}`;
}

async function isConnectionActive(connectionName) {
  const cmd = await execute('nmcli', [
    '-f',
    'GENERAL.STATE',
    'connection',
    'show',
    connectionName
  ]);
  return /^GENERAL.STATE:\s+activated$/.test(cmd.stdout);
}

async function establishConnection(connectionName, password) {
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

async function interruptConnection(connectionName) {
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
