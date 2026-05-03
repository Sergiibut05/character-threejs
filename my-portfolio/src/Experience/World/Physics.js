import Experience from '../Experience.js'

export default class Physics
{
    constructor()
    {
        this.experience = new Experience()

        this.RAPIER = null
        this.world = null
        this.eventQueue = null
        this.characterController = null
        this.debugObjects = []

        this.init()
    }

    async init()
    {
        try {
            // ── Causa #2 fix ────────────────────────────────────────────────
            // Re-use the in-flight Rapier promise that Experience started at
            // app boot (experience._rapierPromise). This means Rapier's WASM
            // download overlaps with all the asset downloads instead of
            // waiting for them to finish first.
            const RAPIER = await this.experience._rapierPromise
            this.RAPIER = RAPIER

            const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0)
            this.world = new RAPIER.World(gravity)
            this.eventQueue = new RAPIER.EventQueue(true)
        } catch(error) {
            console.error('Failed to initialize Rapier physics:', error)
        }
    }

    createGround(size, position = { x: 0, y: 0, z: 0 })
    {
        if(!this.world) return null

        const RAPIER = this.RAPIER
        const groundDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        const ground = this.world.createCollider(groundDesc)
        ground.setTranslation({ x: position.x, y: position.y, z: position.z })
        return ground
    }

    createCharacterController(position = { x: 0, y: 1, z: 0 }, offset = 0.01)
    {
        if(!this.world) return null

        this.characterController = this.world.createCharacterController(offset)
        return this.characterController
    }

    createDynamicBox(size, position, threeMesh = null)
    {
        if(!this.world) return null

        const RAPIER = this.RAPIER
        const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z)
        const rigidBody = this.world.createRigidBody(rigidBodyDesc)

        const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
            .setFriction(0.6)
            .setRestitution(0.1)
            .setActiveCollisionTypes(
                RAPIER.ActiveCollisionTypes.DEFAULT |
                RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
            )

        const collider = this.world.createCollider(colliderDesc, rigidBody)

        if(threeMesh)
        {
            rigidBody.userData = { mesh: threeMesh }
        }

        this.debugObjects.push({ rigidBody, mesh: threeMesh })
        return { rigidBody, collider }
    }

    createStaticBox(size, position, threeMesh = null)
    {
        if(!this.world) return null

        const RAPIER = this.RAPIER
        const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(position.x, position.y, position.z)
        const rigidBody = this.world.createRigidBody(rigidBodyDesc)

        const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
            .setFriction(0.6)
            .setRestitution(0.0)
            .setActiveCollisionTypes(
                RAPIER.ActiveCollisionTypes.DEFAULT |
                RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
            )

        const collider = this.world.createCollider(colliderDesc, rigidBody)

        if(threeMesh)
        {
            rigidBody.userData = { mesh: threeMesh }
        }

        return { rigidBody, collider }
    }

    createStaticTrimesh(geometry, position, quaternion, threeMesh = null)
    {
        if(!this.world) return null

        const RAPIER = this.RAPIER
        const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(position.x, position.y, position.z)
            .setRotation({
                x: quaternion.x,
                y: quaternion.y,
                z: quaternion.z,
                w: quaternion.w
            })
        const rigidBody = this.world.createRigidBody(rigidBodyDesc)

        const vertices = Array.from(geometry.attributes.position.array)
        const indices = geometry.index
            ? Array.from(geometry.index.array)
            : Array.from({ length: vertices.length / 3 }, (_, i) => i)

        const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
            .setFriction(0.8)
            .setRestitution(0.0)

        const collider = this.world.createCollider(colliderDesc, rigidBody)

        if(threeMesh)
        {
            rigidBody.userData = { mesh: threeMesh }
        }

        return { rigidBody, collider }
    }

    update(deltaTime)
    {
        if(!this.world || !this.eventQueue) return

        const timeStep = Math.min(deltaTime, 0.1)
        this.world.timestep = timeStep
        this.world.step(this.eventQueue)

        for(const { rigidBody, mesh } of this.debugObjects)
        {
            if(mesh && rigidBody.isDynamic())
            {
                const translation = rigidBody.translation()
                const rotation = rigidBody.rotation()

                mesh.position.set(translation.x, translation.y, translation.z)
                mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
            }
        }
    }

    getCharacterController()
    {
        return this.characterController
    }
}
