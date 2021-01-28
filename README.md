# nvpn

A script invented for lazy men like me to connect to VPN with 2FA.

## Pre-requirements

- Operating system: Ubuntu (probably, some other Linux distributions - not tested).
- [Node.js](https://nodejs.org/).

## Installation

1. Install the package globally:

    ```
    npm install -g nvpn
    ```

2. Connect (you will be asked for VPN credentials on the first start, they will be stored in `~/.nvpnrc`):

    ```
    nvpn
    ```
   
3. See help for more commands:

    ```
    nvpn --help
    ```
