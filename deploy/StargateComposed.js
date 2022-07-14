const STARGATE = require('../constants/stargate.json')
const AMM_ROUTERS = require('../constants/ammRouters.json')

module.exports = async function ({ deployments, getNamedAccounts }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const stargateRouter = STARGATE.router[hre.network.name]
    console.log(`[${hre.network.name}] Stargate Router address: ${stargateRouter}`)
    const ammRouter = AMM_ROUTERS[hre.network.name]
    console.log(`[${hre.network.name}] AMM Router address: ${ammRouter}`)

    await deploy("StargateComposed", {
        from: deployer,
        args: [stargateRouter, ammRouter],
        log: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["StargateComposed"]
