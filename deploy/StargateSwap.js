const STARGATE = require('../constants/stargate.json')

module.exports = async function ({ deployments, getNamedAccounts }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const stargateRouter = STARGATE.router[hre.network.name]
    console.log(`[${hre.network.name}] Stargate Router address: ${stargateRouter}`)

    await deploy("StargateSwap", {
        from: deployer,
        args: [stargateRouter],
        log: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["StargateSwap"]