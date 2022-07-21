const LZ_ENDPOINTS = require("../constants/layerzeroEndpoints.json")
const OFT_CONFIG = require("../constants/oftConfig.json")
const { ethers } = require("hardhat")

module.exports = async function ({ deployments, getNamedAccounts }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    console.log(`>>> your address: ${deployer}`)

    if (hre.network.name !== OFT_CONFIG.baseChain) {
        console.log("*** Warning: Use [rinkeby] as the base chain for this example!")
        return
    }

    // get the Endpoint address
    const endpointAddr = LZ_ENDPOINTS[hre.network.name]
    const globalSupply = ethers.utils.parseUnits(OFT_CONFIG.globalSupply, 18)
    console.log(`[${hre.network.name}] LayerZero Endpoint address: ${endpointAddr}`)

    await deploy("ExampleBasedOFT20", {
        from: deployer,
        args: [endpointAddr, globalSupply],
        log: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["ExampleBasedOFT20"]
