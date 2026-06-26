export default class EventEmitter
{
    constructor()
    {
        this.callbacks = {}
        this.callbacks.base = {}
    }

    on(_names, callback)
    {
        // Errors
        if(typeof _names === 'undefined' || _names === '')
        {
            console.warn('wrong names')
            return false
        }

        if(typeof callback === 'undefined')
        {
            console.warn('wrong callback')
            return false
        }

        // Resolve names
        const names = this.resolveNames(_names)

        // Each name
        names.forEach((_name) =>
        {
            // Resolve name
            const name = this.resolveName(_name)

            // Create namespace if not exist
            if(!(this.callbacks[ name.namespace ] instanceof Object))
                this.callbacks[ name.namespace ] = {}

            // Create callback if not exist
            if(!(this.callbacks[ name.namespace ][ name.value ] instanceof Array))
                this.callbacks[ name.namespace ][ name.value ] = []

            // Add callback
            this.callbacks[ name.namespace ][ name.value ].push(callback)
        })

        return this
    }

    off(_names, callback)
    {
        // Errors
        if(typeof _names === 'undefined' || _names === '')
        {
            console.warn('wrong name')
            return false
        }

        // Resolve names
        const names = this.resolveNames(_names)

        // Remove either a single callback (when provided) or the whole list for
        // an event. Returns true when the namespace's event list is now empty.
        const removeFrom = (namespace, value) =>
        {
            const list = this.callbacks[ namespace ]?.[ value ]
            if(!(list instanceof Array)) return false

            if(typeof callback === 'function')
            {
                // Remove ONLY the matching callback — leave other listeners
                // (e.g. another subsystem's handler for the same event) intact.
                const filtered = list.filter((cb) => cb !== callback)
                if(filtered.length > 0)
                {
                    this.callbacks[ namespace ][ value ] = filtered
                    return false
                }
            }

            // No callback given (remove all) or list became empty.
            delete this.callbacks[ namespace ][ value ]
            return Object.keys(this.callbacks[ namespace ]).length === 0
        }

        // Each name
        names.forEach((_name) =>
        {
            // Resolve name
            const name = this.resolveName(_name)

            // Remove namespace
            if(name.namespace !== 'base' && name.value === '')
            {
                delete this.callbacks[ name.namespace ]
            }

            // Remove specific callback in namespace
            else
            {
                // Default
                if(name.namespace === 'base')
                {
                    // Try to remove from each namespace
                    for(const namespace in this.callbacks)
                    {
                        if(removeFrom(namespace, name.value))
                            delete this.callbacks[ namespace ]
                    }
                }

                // Specified namespace
                else if(this.callbacks[ name.namespace ] instanceof Object)
                {
                    if(removeFrom(name.namespace, name.value))
                        delete this.callbacks[ name.namespace ]
                }
            }
        })

        return this
    }

    trigger(_name, _args)
    {
        // Errors
        if(typeof _name === 'undefined' || _name === '')
        {
            console.warn('wrong name')
            return false
        }

        let finalResult = null
        let result = null

        // Default args
        const args = !(_args instanceof Array) ? [] : _args

        // Resolve names (should on have one event)
        let name = this.resolveNames(_name)

        // Resolve name
        name = this.resolveName(name[ 0 ])

        // Run a single listener in isolation: one throwing callback must NOT
        // prevent the remaining listeners for the same event from running.
        const runCallback = (callback) =>
        {
            try
            {
                result = callback.apply(this, args)
            }
            catch(err)
            {
                console.error(`EventEmitter: listener for "${name.value}" threw`, err)
                result = undefined
            }

            if(typeof finalResult === 'undefined')
                finalResult = result
        }

        // Default namespace
        if(name.namespace === 'base')
        {
            // Try to find callback in each namespace
            for(const namespace in this.callbacks)
            {
                if(this.callbacks[ namespace ] instanceof Object && this.callbacks[ namespace ][ name.value ] instanceof Array)
                {
                    this.callbacks[ namespace ][ name.value ].forEach(runCallback)
                }
            }
        }

        // Specified namespace
        else if(this.callbacks[ name.namespace ] instanceof Object)
        {
            if(name.value === '')
            {
                console.warn('wrong name')
                return this
            }

            this.callbacks[ name.namespace ][ name.value ].forEach(runCallback)
        }

        return finalResult
    }

    resolveNames(_names)
    {
        let names = _names
        names = names.replace(/[^a-zA-Z0-9 ,/.]/g, '')
        names = names.replace(/[,/]+/g, ' ')
        names = names.split(' ')

        return names
    }

    resolveName(name)
    {
        const newName = {}
        const parts = name.split('.')

        newName.original  = name
        newName.value     = parts[ 0 ]
        newName.namespace = 'base' // Base namespace

        // Specified namespace
        if(parts.length > 1 && parts[ 1 ] !== '')
        {
            newName.namespace = parts[ 1 ]
        }

        return newName
    }
}
