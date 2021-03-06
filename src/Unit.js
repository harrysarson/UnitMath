import createParser from './Parser.js'
import createUnitStore from './UnitStore.js'


/* The export will be a function named unit.

unit's prototype will have some method properties, like add and mul.

There is also a function named config. It returns a _new_ function named unit, that has different prototype or something.

So when this module is loaded, it needs to run config once with default options.

Units are immutable, so all public functions that return a new unit must freeze the unit. The constructor does not freeze it, because some mutation is necessary after constructing the unit.

TODO: Make things behave nicely when performing operations between units that exist in different namespaces (ahhhhh!)

TODO: Store value in the original units (the "denormalized" value), so that there is no round-off error. Upon conversion or simplification, the internal value might change.

TODO: Change normalize and denormalize to something more intuitive

TODO: Make a function that combines equal units (ft ft becomes ft^2, for instance)

*/

/* Will any of the configuration options affect parsing? They might. So we will also create a new parse function every time config is called. */

/**
 * Create a clone of the this unit factory function, but with the specified options.
 * @param {Object} options Configuration options to set on the new instance.
 * @returns {Function} A new instance of the unit factory function with the specified options.
 */
let _config = function _config(options) {

  options = Object.assign({}, options)
  Object.freeze(options)

  /**
   * Factory function unitmath returns a new Unit (so that user does not have to use "new" keyword, but we still benefit from using prototypes)
   * @param {Number|String|*} value The `number` to assign to the unit, or a `string` representing the value and the unit string together.
   * @param {String} unitString The unit string, unless already included in the `value` parameter.
   * @returns {Unit} The Unit given by the value and unit string.
   */
  function unitmath(value, unitString) {
    let unit = new Unit(value, unitString)
    Object.freeze(unit)
    return unit
  }

  /**
   * The actual constructor for Unit. Creates a new Unit with the specified value and unit string.
   * @param {Number|String|*} value The `number` to assign to the unit, or a `string` representing the value and the unit string together.
   * @param {String} unitString The unit string, unless already included in the `value` parameter.
   * @returns {Unit} The Unit given by the value and unit string.
   */
  function Unit(value, unitString) {

    if (!(this instanceof Unit)) {
      throw new Error('_unit constructor must be called with the new operator')
    }
    // console.log(`Inside the constructor: _unit(${value}, ${unitString})`)

    // Allowed signatures:
    // Unit(string)
    // Unit(*)
    // Unit(*, string)

    let parseResult
    if (typeof value === 'undefined' && typeof unitString === 'undefined') {
      parseResult = parser('')
      parseResult.value = null
    }
    else if (typeof value === 'string' && typeof unitString === 'undefined') {
      parseResult = parser(value)
    }
    else if (typeof unitString === 'string') {
      parseResult = parser(unitString)
      parseResult.value = value
    }
    else if (typeof unitString === 'undefined') {
      parseResult = parser('')
      parseResult.value = value
    }
    else {
      throw new TypeError('To construct a unit, you must supply a single string, a number and a string, or a custom type and a string.')
    }

    this.type = 'Unit'
    this.dimensions = parseResult.dimensions
    this.units = _combineDuplicateUnits(parseResult.units)

    // TODO: All the denormalizing/normalizing creates round-off error. See if we can reduce the number of floating point operations somehow.
    this.value = (parseResult.value === undefined || parseResult.value === null) ? null : _denormalize(this.units, _normalize(parseResult.units, parseResult.value))

  }

  // These are public methods available to each instance of a Unit. They each should return a frozen Unit.

  /**
   * create a copy of this unit
   * @memberof Unit
   * @return {Unit} Returns a cloned version of the unit
   */
  Unit.prototype.clone = function () {
    let unit = _clone(this)
    Object.freeze(unit)
    return unit
  }

  /**
   * Adds two units. Both units' dimensions must be equal.
   * @param {Unit|string} other The unit to add to this one. If a string is supplied, it will be converted to a unit.
   * @returns {Unit} The result of adding this and the other unit.
   */
  Unit.prototype.add = function (other) {
    other = _convertParamToUnit(other)
    let unit = _add(this, other)
    Object.freeze(unit)
    return unit
  }

  /**
   * Subtracts two units. Both units' dimensions must be equal.
   * @param {Unit|string} other The unit to subtract from this one. If a string is supplied, it will be converted to a unit.
   * @returns {Unit} The result of subtract this and the other unit.
   */
  Unit.prototype.sub = function (other) {
    other = _convertParamToUnit(other)
    let unit = _sub(this, other)
    Object.freeze(unit)
    return unit
  }

  /**
   * Multiplies two units. 
   * @param {Unit|string} other The unit to multiply to this one.
   * @returns {Unit} The result of multiplying this and the other unit.
   */
  Unit.prototype.mul = function (other) {
    other = _convertParamToUnit(other)
    let unit = _mul(this, other)
    Object.freeze(unit)
    return unit
  }

  /**
   * Divides two units. 
   * @param {Unit|string} other The unit to divide this unit by.
   * @returns {Unit} The result of dividing this by the other unit.
   */
  Unit.prototype.div = function (other) {
    other = _convertParamToUnit(other)
    let unit = _div(this, other)
    Object.freeze(unit)
    return unit
  }


  /**
   * Calculate the power of a unit
   * @memberof Unit
   * @param {number|custom} p
   * @returns {Unit}      The result: this^p
   */
  Unit.prototype.pow = function (p) {
    let unit = _pow(this, p)
    Object.freeze(unit)
    return unit
  }

  /**
   * Takes the square root of a unit.
   * @memberof Unit
   * @param {Unit|string|number} a The unit.
   * @returns {Unit} The square root of the unit a.
   */
  Unit.prototype.sqrt = function () {
    let unit = _sqrt(this)
    Object.freeze(unit)
    return unit
  }

  /**
   * Convert the unit to a specific unit name.
   * @memberof Unit
   * @param {string | Unit} valuelessUnit   A unit without value. Can have prefix, like "cm"
   * @returns {Unit} Returns a clone of the unit with a fixed prefix and unit.
   */
  Unit.prototype.to = function (valuelessUnit) {
    if (!(valuelessUnit instanceof Unit) && typeof valuelessUnit !== 'string') {
      throw new TypeError('Parameter must be a Unit or a string.')
    }
    valuelessUnit = _convertParamToUnit(valuelessUnit)
    let unit = _to(this, valuelessUnit)
    Object.freeze(unit)
    return unit
  }

  /**
   * Convert the unit to a specific unit.
   * @memberof Unit
   * @param {string | Unit} valuelessUnit   A unit without value. Can have prefix, like "cm"
   * @returns {Unit} Returns a clone of the unit with a fixed prefix and unit.
   */
  Unit.prototype.to = function (valuelessUnit) {
    if (!(valuelessUnit instanceof Unit) && typeof valuelessUnit !== 'string') {
      throw new TypeError('Parameter must be a Unit or a string.')
    }
    valuelessUnit = _convertParamToUnit(valuelessUnit)
    let unit = _to(this, valuelessUnit)
    Object.freeze(unit)
    return unit
  }

  /**
   * Convert the unit to SI units.
   * @memberof Unit
   * @returns {Unit} Returns a clone of the unit with a fixed prefix and unit.
   */
  Unit.prototype.toSI = function () {
    let unit = _toSI(this)
    Object.freeze(unit)
    return unit
  }

  /**
   * Returns this unit without a value.
   * @memberof Unit
   * @returns {Unit} A new unit formed by removing the value from this unit.
   */
  Unit.prototype.getUnits = function () {
    let result = _clone(this)
    result.value = null
    Object.freeze(result)
    return result
  }


  // These private functions do not freeze the units before returning, so that we can do mutations on the units before returning the final, frozen unit to the user.

  // TODO: Possible source of unhelpful error message and user confusion, if user supplies a type that it not a unit, not a string, and not a number, to a public API method that uses this function to convert input to a unit. Since there is no way to know whether a user might be using a custom type, or just sent the wrong type.
  /**
   * Converts the supplied parameter to a frozen unit, or, if a unit was supplied, returns it unchanged.
   * @param {any} param 
   * @returns {Unit} The frozen unit that was converted from the input parameter, or the original unit.
   */
  function _convertParamToUnit(param) {
    if (param instanceof Unit) {
      return param
    }
    return unitmath(param)
  }

  /**
   * Private function _clone
   * @param {Unit} unit 
   */
  function _clone(unit) {
    const result = new Unit()

    result.value = unit.value === null ? null : options.customClone(unit.value)
    result.dimensions = unit.dimensions.slice(0)
    result.units = []
    for (let i = 0; i < unit.units.length; i++) {
      result.units[i] = {}
      for (const p in unit.units[i]) {
        if (unit.units[i].hasOwnProperty(p)) {
          result.units[i][p] = unit.units[i][p]
        }
      }
    }

    return result
  }

  /**
   * Private function _combineDuplicateUnits returns a new array of unit pieces where the duplicate units have been combined together. Units with zero power are also removed.
   * @param {unit[]} units Array of unit pieces 
   * @returns {unit[]} A new array of unit pieces where the duplicates have been combined together and units with zero power have been removed.
   */
  function _combineDuplicateUnits(units) {
    // Two-level deep copy of units
    let result = units.map(u => Object.assign({}, u))
    
    if(result.length >= 2) {
      if(units[0] === result[0])
        throw new Error('Debug assertion failed, result is not a clone of units')
      if(units[0].units !== result[0].units) 
        throw new Error('Debug assertion failed, units\' units were cloned')


      // Combine duplicate units
      let foundUnits = {}
      for(let i=0; i<result.length; i++) {
        if(foundUnits.hasOwnProperty(result[i].unit.name)) {
          // Combine this unit with the other
          let firstUnit = foundUnits[result[i].unit.name]
          // console.log(`Found duplicate unit: ${result[i].unit.name}`)
          // console.log(firstUnit.power)
          // console.log(result[i].power)
          firstUnit.power += result[i].power
          result.splice(i, 1)
          i--
        }
        else {
          foundUnits[result[i].unit.name] = result[i]
        }
      }

      // Remove units that have zero power
      for(let i=0; i<result.length; i++) {
        if(Math.abs(result[i].power) < 1e-15) {
          result.splice(i, 1)
          i--
        }
      }
      
    }

    return result
  }

  /**
   * Private function _add
   * @param {Unit} unit1 The first unit
   * @param {Unit} unit2 The second unit
   * @returns {Unit} The sum of the two units
   */
  function _add(unit1, unit2) {
    if (unit1.value === null || unit1.value === undefined || unit2.value === null || unit2.value === undefined) {
      throw new Error(`Cannot add ${unit1.toString()} and ${unit2.toString()}: both units must have values`)
    }
    if (!unit1._equalDimension(unit2)) {
      throw new Error(`Cannot add ${unit1.toString()} and ${unit2.toString()}: dimensions do not match`)
    }
    const result = _clone(unit1)
    result.value = _denormalize(unit1.units, options.customAdd(_normalize(unit1.units, unit1.value), _normalize(unit2.units, unit2.value)))
    return result
  }

  /**
   * Private function _sub
   * @param {Unit} unit1 The first unit
   * @param {Unit} unit2 The second unit
   * @returns {Unit} The difference of the two units
   */
  function _sub(unit1, unit2) {
    if (unit1.value === null || unit1.value === undefined || unit2.value === null || unit2.value === undefined) {
      throw new Error(`Cannot subtract ${unit1.toString()} and ${unit2.toString()}: both units must have values`)
    }
    if (!unit1._equalDimension(unit2)) {
      throw new Error(`Cannot subtract ${unit1.toString()} and ${unit2.toString()}: dimensions do not match`)
    }
    const result = _clone(unit1)
    result.value = _denormalize(unit1.units, options.customSub(_normalize(unit1.units, unit1.value), _normalize(unit2.units, unit2.value)))
    return result
  }

  /**
   * Private function _mul
   * @param {Unit} unit1 The first unit
   * @param {Unit} unit2 The second unit
   * @returns {Unit} The product of the two units
   */
  function _mul(unit1, unit2) {

    const result = _clone(unit1)

    for (let i = 0; i < unitStore.BASE_DIMENSIONS.length; i++) {
      // Dimensions arrays may be of different lengths. Default to 0.
      result.dimensions[i] = unit1.dimensions[i] + unit2.dimensions[i]
    }

    // Append other's units list onto result
    for (let i = 0; i < unit2.units.length; i++) {
      // Make a deep copy
      const inverted = {}
      for (const key in unit2.units[i]) {
        inverted[key] = unit2.units[i][key]
      }
      result.units.push(inverted)
    }

    result.units = _combineDuplicateUnits(result.units)

    // If at least one operand has a value, then the result should also have a value
    if (unit1.value !== null || unit2.value !== null) {
      const val1 = unit1.value === null ? _normalize(unit1.units, 1) : _normalize(unit1.units, unit1.value)
      const val2 = unit2.value === null ? _normalize(unit2.units, 1) : _normalize(unit2.units, unit2.value)
      result.value = _denormalize(result.units, options.customMul(val1, val2))
    } else {
      result.value = null
    }

    return result
  }

  /**
   * Private function _div
   * @param {Unit} unit1 The first unit
   * @param {Unit} unit2 The second unit
   */
  function _div(unit1, unit2) {

    const result = _clone(unit1)

    for (let i = 0; i < unitStore.BASE_DIMENSIONS.length; i++) {
      result.dimensions[i] = unit1.dimensions[i] - unit2.dimensions[i]
    }

    // Invert and append other's units list onto result
    for (let i = 0; i < unit2.units.length; i++) {
      // Make a deep copy
      const inverted = {}
      for (const key in unit2.units[i]) {
        inverted[key] = unit2.units[i][key]
      }
      inverted.power = -inverted.power
      result.units.push(inverted)
    }

    result.units = _combineDuplicateUnits(result.units)

    // If at least one operand has a value, the result should have a value
    if (unit1.value !== null || unit2.value !== null) {
      const val1 = unit1.value === null ? _normalize(unit1.units, 1) : _normalize(unit1.units, unit1.value)
      const val2 = unit2.value === null ? _normalize(unit2.units, 1) : _normalize(unit2.units, unit2.value)
      result.value = _denormalize(result.units, options.customDiv(val1, val2))
    } else {
      result.value = null
    }

    return result
  }

  /**
   * Private function _pow
   * @param {Unit} unit The unit
   * @param {number|custom} p The exponent
   */
  function _pow(unit, p) {
    const result = _clone(unit)
    for (let i = 0; i < unitStore.BASE_DIMENSIONS.length; i++) {
      result.dimensions[i] = options.customMul(unit.dimensions[i], p)
    }

    // Adjust the power of each unit in the list
    for (let i = 0; i < result.units.length; i++) {
      result.units[i].power = options.customMul(result.units[i].power, p)
    }

    if (result.value !== null) {
      result.value = options.customPow(result.value, p)
    } else {
      result.value = null
    }

    return result
  }

  function _sqrt(unit) {
    return _pow(unit, options.customConv(0.5))
  }


  /**
   * Normalize a value, based on an array of unit pieces
   * @param {unit[]} unitPieces
   * @param {number | *} value
   * @return {number | *} normalized value
   * @private
   */
  function _normalize(unitPieces, value) {
    let unitValue, unitOffset, unitPower, unitPrefixValue

    if (value === null || value === undefined || unitPieces.length === 0) {
      return value
    } else if (_isCompound(unitPieces)) {
      // units is a compound unit, so do not apply offsets.
      // For example, with J kg^-1 degC^-1 you would NOT want to apply the offset.
      let result = value

      for (let i = 0; i < unitPieces.length; i++) {
        unitValue = options.customConv(unitPieces[i].unit.value)
        unitPrefixValue = options.customConv(unitPieces[i].prefix.value)
        unitPower = options.customConv(unitPieces[i].power)
        result = options.customMul(result, options.customPow(options.customMul(unitValue, unitPrefixValue), unitPower))
      }

      return result
    } else {
      // units is a single unit of power 1, like kg or degC
      unitValue = options.customConv(unitPieces[0].unit.value)
      unitOffset = options.customConv(unitPieces[0].unit.offset)
      unitPrefixValue = options.customConv(unitPieces[0].prefix.value)

      return options.customMul(options.customAdd(value, unitOffset), options.customMul(unitValue, unitPrefixValue))
    }
  }

  /**
   * Denormalize a value, based on an array of atomic units
   * @param {unit[]} unitPieces Array of atomic units (as in, Unit.units)
   * @param {number} value
   * @param {number} [prefixValue]    Optional prefix value to be used (ignored if this is a derived unit)
   * @return {number} denormalized value
   * @private
   */
  function _denormalize(unitPieces, value, prefixValue) {
    let unitValue, unitOffset, unitPower, unitPrefixValue

    if (value === null || value === undefined || unitPieces.length === 0) {
      return value
    } else if (_isCompound(unitPieces)) {
      // unit is a compound unit, so do not apply offsets.
      // For example, with J kg^-1 degC^-1 you would NOT want to apply the offset.
      // Also, prefixValue is ignored--but we will still use the prefix value stored in each unit, since kg is usually preferable to g unless the user decides otherwise.
      let result = value

      for (let i = 0; i < unitPieces.length; i++) {
        unitValue = options.customConv(unitPieces[i].unit.value)
        unitPrefixValue = options.customConv(unitPieces[i].prefix.value)
        unitPower = options.customConv(unitPieces[i].power)
        result = options.customDiv(result, options.customPow(options.customMul(unitValue, unitPrefixValue), unitPower))
      }

      return result
    } else {
      // unit is a single unit of power 1, like kg or degC

      unitValue = options.customConv(unitPieces[0].unit.value)
      unitPrefixValue = options.customConv(unitPieces[0].prefix.value)
      unitOffset = options.customConv(unitPieces[0].unit.offset)

      if (prefixValue === undefined || prefixValue === null) {
        return options.customSub(options.customDiv(options.customDiv(value, unitValue), unitPrefixValue), unitOffset)
      } else {
        return options.customSub(options.customDiv(options.customDiv(value, unitValue), prefixValue), unitOffset)
      }
    }
  }

  /**
   * Private function _to
   * @param {Unit} unit The unit to convert.
   * @param {Unit} valuelessUnit The valueless unit to convert it to.
   */
  function _to(unit, valuelessUnit) {
    let result
    const value = unit.value === null ? _normalize(unit.units, 1) : unit.value

    if (!unit._equalDimension(valuelessUnit)) {
      throw new TypeError(`Cannot convert ${unit.toString()} to ${valuelessUnit}: dimensions do not match)`)
    }
    if (valuelessUnit.value !== null) {
      throw new Error(`Cannot convert ${unit.toString()}: target unit must be valueless`)
    }
    result = _clone(valuelessUnit)
    result.value = options.customClone(_denormalize(result.units, _normalize(unit.units, value)))
    return result
  }

  /**
   * Private function _toSI
   * @param {Unit} unit The unit to convert to SI.
   */
  function _toSI(unit) {
    const result = _clone(unit)

    const proposedUnitList = []

    // Multiple units or units with powers are formatted like this:
    // 5 (kg m^2) / (s^3 mol)
    // Build an representation from the base units of the SI unit system
    for (let i = 0; i < unitStore.BASE_DIMENSIONS.length; i++) {
      const baseDim = unitStore.BASE_DIMENSIONS[i]
      if (Math.abs(result.dimensions[i] || 0) > 1e-12) {
        if (unitStore.UNIT_SYSTEMS['si'].hasOwnProperty(baseDim)) {
          proposedUnitList.push({
            unit: unitStore.UNIT_SYSTEMS['si'][baseDim].unit,
            prefix: unitStore.UNIT_SYSTEMS['si'][baseDim].prefix,
            power: result.dimensions[i] || 0
          })
        } else {
          throw new Error('Cannot express custom unit ' + baseDim + ' in SI units')
        }
      }
    }

    // Replace this unit list with the proposed list
    result.units = proposedUnitList
    if (unit.value !== null)
      result.value = options.customClone(_denormalize(result.units, _normalize(unit.units, unit.value)))

    return result
  }

  /**
   * Returns whether the unit is compound (like m/s, cm^2) or not (kg, N, hogshead)
   * @memberof Unit
   * @returns True if the unit is compound
   */
  Unit.prototype.isCompound = function() {
    return _isCompound(this.units)
  }

  /**
   * Return whether the given array of unit pieces is compound (contains multiple units, such as m/s, or cm^2, but not N)
   * @param {unit[]} units Array of unit pieces
   * @return {boolean} True if the unit is compound
   */
  function _isCompound(units) {
    if (units.length === 0) {
      return false
    }
    return units.length > 1 || Math.abs(units[0].power - 1.0) > 1e-15
  }

  /**
   * check if this unit has given base unit
   * @memberof Unit
   * @param {DIMENSION | string | undefined} dim
   */
  Unit.prototype._hasDimension = function (dimension) {
    if (typeof (dimension) === 'string') {
      dimension = unitStore.DIMENSIONS[dimension]
    }

    if (!dimension) { return false }

    // All dimensions must be the same
    for (let i = 0; i < unitStore.BASE_DIMENSIONS.length; i++) {
      if (Math.abs((this.dimensions[i] || 0) - (dimension.dimensions[i] || 0)) > 1e-12) {
        return false
      }
    }
    return true
  }

  /**
   * Check if this unit has a dimension equal to another unit
   * @param {Unit} other
   * @return {boolean} true if equal dimensions
   */
  Unit.prototype._equalDimension = function (other) {
    // All dimensions must be the same
    for (let i = 0; i < unitStore.BASE_DIMENSIONS.length; i++) {
      if (Math.abs(this.dimensions[i] - other.dimensions[i]) > 1e-12) {
        return false
      }
    }
    return true
  }

  /**
   * Check if this unit equals another unit
   * @memberof Unit
   * @param {Unit} other
   * @return {boolean} true if both units are equal
   */
  Unit.prototype.equals = function (other) {
    other = _convertParamToUnit(other)
    return this._equalDimension(other) && options.customEq(_normalize(this.units, this.value), _normalize(other.units, other.value))
  }

  Unit.prototype.toString = function () {
    return this.format()
  }

  /**
    * Get a string representation of the Unit, with optional formatting options.
    * @memberof Unit
    * @param {Object} [options]  Formatting options.
    * @return {string}
    */
  Unit.prototype.format = function (options) {

    let simp = this.clone()

    // TODO: Apply automatic simplification steps if specified in the config options

    let str = (simp.value !== null) ? simp.value.toString() : ''
    const unitStr = _formatUnits(simp)
    if (unitStr.length > 0 && str.length > 0) {
      str += ' '
    }
    str += unitStr

    return str
  }

  /**
   * Get a string representation of the units of this Unit, without the value.
   * @return {string}
   */
  function _formatUnits(unit) {
    let strNum = ''
    let strDen = ''
    let nNum = 0
    let nDen = 0

    for (let i = 0; i < unit.units.length; i++) {
      if (unit.units[i].power > 0) {
        nNum++
        strNum += ' ' + unit.units[i].prefix.name + unit.units[i].unit.name
        if (Math.abs(unit.units[i].power - 1.0) > 1e-15) {
          strNum += '^' + unit.units[i].power
        }
      } else if (unit.units[i].power < 0) {
        nDen++
      }
    }

    if (nDen > 0) {
      for (let i = 0; i < unit.units.length; i++) {
        if (unit.units[i].power < 0) {
          if (nNum > 0) {
            strDen += ' ' + unit.units[i].prefix.name + unit.units[i].unit.name
            if (Math.abs(unit.units[i].power + 1.0) > 1e-15) {
              strDen += '^' + (-unit.units[i].power)
            }
          } else {
            strDen += ' ' + unit.units[i].prefix.name + unit.units[i].unit.name
            strDen += '^' + (unit.units[i].power)
          }
        }
      }
    }

    // Remove leading " "
    strNum = strNum.substr(1)
    strDen = strDen.substr(1)

    // Add parans for better copy/paste back into evaluate, for example, or for better pretty print formatting
    if (nNum > 1 && nDen > 0) {
      strNum = '(' + strNum + ')'
    }
    if (nDen > 1 && nNum > 0) {
      strDen = '(' + strDen + ')'
    }

    let str = strNum
    if (nNum > 0 && nDen > 0) {
      str += ' / '
    }
    str += strDen

    return str
  }


  let unitStore = createUnitStore(options)

  // Create a parser configured for these options
  let parser = createParser(options, unitStore)

  /**
   * Create a clone of the this unit factory function, but with the specified options.
   * @param {Object} options Configuration options, in addition to those existing, to set on the new instance.
   * @returns {Function} A new instance of the unit factory function with the specified options.
   */
  unitmath.config = function config(newOptions) {
    if (typeof (newOptions) === 'undefined') {
      return options
    }

    let retOptions = Object.assign({}, options, newOptions)
    return _config(retOptions)
  }

  /* Alternate API syntax */

  /**
   * Adds two units. Both units' dimensions must be equal.
   * @param {Unit|string|number} a The first unit to add. If a string or number is supplied, it will be converted to a unit.
   * @param {Unit|string|number} b The second unit to add. If a string or number is supplied, it will be converted to a unit.
   * @returns {Unit} The result of the addition a + b.
   */
  unitmath.add = function add(a, b) {
    return _convertParamToUnit(a).add(b)
  }

  /**
   * Subtracts two units. Both units' dimensions must be equal.
   * @param {Unit|string|number} a The first unit. If a string or number is supplied, it will be converted to a unit.
   * @param {Unit|string|number} b The second unit. If a string or number is supplied, it will be converted to a unit.
   * @returns {Unit} The result of the subtract a - b.
   */
  unitmath.sub = function sub(a, b) {
    return _convertParamToUnit(a).sub(b)
  }

  /**
   * Multiplies two units. Both units' dimensions must be equal.
   * @param {Unit|string|number} a The first unit. If a string or number is supplied, it will be converted to a unit.
   * @param {Unit|string|number} b The second unit. If a string or number is supplied, it will be converted to a unit.
   * @returns {Unit} The result a * b.
   */
  unitmath.mul = function mul(a, b) {
    return _convertParamToUnit(a).mul(b)
  }

  /**
   * Divides two units. Both units' dimensions must be equal.
   * @param {Unit|string|number} a The first unit. If a string or number is supplied, it will be converted to a unit.
   * @param {Unit|string|number} b The second unit. If a string or number is supplied, it will be converted to a unit.
   * @returns {Unit} The result a / b.
   */
  unitmath.div = function div(a, b) {
    return _convertParamToUnit(a).div(b)
  }
  /**
   * Raises a unit to a power.
   * @param {Unit|string|number} a The unit.
   * @param {number} b The power.
   * @returns {Unit} The result of raising the unit a to the power b.
   */
  unitmath.pow = function pow(a, b) {
    return _convertParamToUnit(a).pow(b)
  }

  /**
  * Takes the square root of a unit.
  * @param {Unit|string|number} a The unit.
  * @returns {Unit} The square root of the unit a.
  */
  unitmath.sqrt = function sqrt(a) {
    return _convertParamToUnit(a).sqrt()
  }

  /**
  * Convert a unit.
  * @param {Unit|string|number} unit The unit to convert.
  * @param {Unit|string} valuelessUnit The valueless unit to convert the first unit to.
  * @returns {Unit} The result of converting the unit.
  */
  unitmath.to = function to(unit, valuelessUnit) {
    return _convertParamToUnit(unit).to(valuelessUnit)
  }

  /**
  * Convert a unit to SI.
  * @param {Unit|string|number} unit The unit to convert.
  * @returns {Unit} The result of converting the unit to SI.
  */
  unitmath.toSI = function toSI(unit) {
    return _convertParamToUnit(unit).toSI()
  }

  unitmath.exists = unitStore.exists

  unitmath._unitStore = unitStore


  Object.freeze(unitmath)


  return unitmath

}

// Define default arithmetic functions
let customAdd = (a, b) => a + b
let customSub = (a, b) => a - b
let customMul = (a, b) => a * b
let customDiv = (a, b) => a / b
let customPow = (a, b) => Math.pow(a, b)
let customEq = (a, b) => a === b
let customConv = a => a
let customClone = (a) => {
  if (typeof (a) !== 'number') {
    throw new TypeError(`To clone units with value types other than 'number', you must configure a custom 'clone' method. (Value type is ${typeof (a)})`)
  }
  return a
}

let defaultOptions = {
  levelOfAwesomeness: 11,
  customAdd, customSub, customMul, customDiv, customPow, customEq, customConv, customClone
}

let firstUnit = _config(defaultOptions, {})

export default firstUnit
