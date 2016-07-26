/* eslint-env mocha */

var expect = require('chai').expect
var refData = require('./reference-data.js')
var runAdapters = require('./adapters-run.js')

// Collecting the adapter's output.
var collectedData

function _collectOutput (eventName, done, eventData) {
  collectedData.push([eventName, eventData])
  done()
}

/**
 * Attaches the event handler for the runner events.
 */
function _attachListeners (done, runner) {
  var dummyFunc = function () {}

  runner.on('runStart', _collectOutput.bind(null, 'runStart', dummyFunc))
  runner.on('suiteStart', _collectOutput.bind(null, 'suiteStart', dummyFunc))
  runner.on('testStart', _collectOutput.bind(null, 'testStart', dummyFunc))
  runner.on('testEnd', _collectOutput.bind(null, 'testEnd', dummyFunc))
  runner.on('suiteEnd', _collectOutput.bind(null, 'suiteEnd', dummyFunc))

  // Only when the runEnd event is emitted we can notify Mocha that we are done.
  runner.on('runEnd', _collectOutput.bind(null, 'runEnd', done))
}

/**
 * Recursively iterate over each suite and set their tests runtime to 0ms.
 */
function _setSuiteTestsRuntime (suite) {
  suite.tests.forEach(function (test) {
    if (test.status !== 'skipped') {
      test.runtime = 0
    }
  })

  suite.childSuites.forEach(function (childSuite) {
    _setSuiteTestsRuntime(childSuite)
  })
}

/**
 * Overwrite test assertions (for test frameworks that provide this) so that
 * they will match match those from the refrence-data file.
 */
function _overWriteTestAssertions (test) {
  test.errors.forEach(function (error) {
    error.actual = undefined
    error.expected = undefined
    error.message = undefined
    error.stack = undefined
  })

  test.assertions.forEach(function (assertion) {
    assertion.actual = undefined
    assertion.expected = undefined
    assertion.message = undefined
    assertion.stack = undefined
  })
}

/**
 * Recursively iterates over suites and overwrites tests assertions. Check
 * also _overWriteTestNormalizedAssertions function.
 */
function _overWriteSuitesAssertions (suite) {
  suite.tests.forEach(function (test) {
    _overWriteTestAssertions(test)
  })

  suite.childSuites.forEach(function (childSuite) {
    _overWriteSuitesAssertions(childSuite)
  })
}

/**
 * Fills the assertions and error properties with assertions so that they will
 * match with those from the data-refrence file, also as content as also as
 * number of contained assertions.
 */
function _fillTestAssertions (refTest, test) {
  refTest.assertions.forEach(function (assertion) {
    test.assertions.push(assertion)
  })

  test.errors = []

  refTest.errors.forEach(function (error) {
    test.errors.push(error)
  })
}

/**
 * Recursively iterates over suites and fills with assertions. Check also
 * _fillTestAssertins function.
 */
function _fillSuiteAssertions (refSuite, suite) {
  refSuite.tests.forEach(function (refTest, index) {
    _fillTestAssertions(refTest, suite.tests[index])
  })

  refSuite.childSuites.forEach(function (childSuite, index) {
    _fillSuiteAssertions(childSuite, suite.childSuites[index])
  })
}

describe('Adapters integration', function () {
  Object.keys(runAdapters).forEach(function (adapter) {
    describe(adapter + ' adapter', function () {
      var keys = ['passed', 'actual', 'expected', 'message', 'stack']

      before(function (done) {
        collectedData = []
        runAdapters[adapter](_attachListeners.bind(null, done))
      })

      it('tests runtime should be a number', function () {
        collectedData.forEach(function (value) {
          if (value[0] === 'testEnd' && value[1].status !== 'skipped') {
            expect(value[1].runtime).to.be.a('number')
          }
        })
      })

      it('testing tests errors prop', function () {
        var refTestsEnd = refData.filter(function (value) {
          return value[0] === 'testEnd'
        })

        var testsEnd = collectedData.filter(function (value) {
          return value[0] === 'testEnd'
        })

        refTestsEnd.forEach(function (value, index) {
          var refTest = value[1]
          var test = testsEnd[index][1]

          if (refTest.status === 'passed' || refTest.status === 'skipped') {
            expect(test.errors).to.be.deep.equal(refTest.errors)
          } else {
            expect(test.errors).to.have.lengthOf(refTest.errors.length)

            test.errors.forEach(function (error) {
              expect(error).to.have.all.keys(keys)

              expect(error.passed).to.be.false
              expect(error.message).to.be.a('string')
              expect(error.stack).to.be.a('string')
            })
          }
        })
      })

      it('testing tests assertions prop', function () {
        var refTestsEnd = refData.filter(function (value) {
          return value[0] === 'testEnd'
        })

        var testsEnd = collectedData.filter(function (value) {
          return value[0] === 'testEnd'
        })

        // If the framework under testing is Mocha, then apply other
        // expectations and then exit (Mocha provides for the assertions prop an
        // empty array).
        if (adapter === 'Mocha') {
          refTestsEnd.forEach(function (value, index) {
            var test = testsEnd[index][1]

            expect(test.assertions).to.be.deep.equal([])
          })

          return
        }

        refTestsEnd.forEach(function (value, index) {
          var refTest = value[1]
          var test = testsEnd[index][1]

          // Expect to contain the correct number of assertions.
          expect(test.assertions).to.have.lengthOf(refTest.assertions.length)

          var passedAssertions = test.assertions.filter(function (assertion) {
            return assertion.passed
          })

          var failedAssertions = test.assertions.filter(function (assertion) {
            return !assertion.passed
          })

          passedAssertions.forEach(function (assertion) {
            expect(assertion).to.have.all.keys(keys)

            expect(assertion.passed).to.be.true
            expect(assertion.message).to.be.a('string')
            expect(assertion.stack).to.be.undefined
          })

          failedAssertions.forEach(function (assertion) {
            expect(assertion).to.have.all.keys(keys)

            expect(assertion.passed).to.be.false
            expect(assertion.message).to.be.a('string')
            expect(assertion.stack).to.be.a('string')
          })
        })
      })

      refData.forEach(function (value, index) {
        var testDescription = value[2]

        it(testDescription, function () {
          var refEvent = value[0]
          var refTestItem = value[1]
          var event = collectedData[index][0]
          var testItem = collectedData[index][1]

          // Set tests runtime to 0 to match the reference tests runtime.
          if (event === 'testEnd' && testItem.status !== 'skipped') {
            collectedData[index][1].runtime = 0
          }

          // Set suite tests runtime to 0, also for the globalSuite.
          if (event === 'suiteEnd' || event === 'runEnd') {
            _setSuiteTestsRuntime(collectedData[index][1])
          }

          // Set assertions to match those from data-refrence file.
          if (event === 'testEnd') {
            if (adapter === 'Mocha') {
              _fillTestAssertions(refTestItem, testItem)
            } else {
              _overWriteTestAssertions(testItem)
            }
          }

          // Set assertions to match thos from the data-refrence file.
          if (event === 'suiteEnd' || event === 'runEnd') {
            if (adapter === 'Mocha') {
              _fillSuiteAssertions(refTestItem, testItem)
            } else {
              _overWriteSuitesAssertions(testItem)
            }
          }

          expect(event).equal(refEvent)
          expect(testItem).to.be.deep.equal(refTestItem)

          // Verify suite start dynamic props.
          if (event === 'suiteStart' || event === 'runStart') {
            expect(testItem.status).to.be.undefined
            expect(testItem.runtime).to.be.undefined
          }

          // Verify suite end dynamic props.
          if (event === 'suiteEnd' || event === 'runEnd') {
            var refStatus = value[3]

            expect(testItem.status).to.be.equal(refStatus)

            if (testItem.status !== 'skipped') {
              expect(testItem.runtime).to.be.a('number')
            } else {
              expect(testItem.runtime).to.be.undefined
            }
          }
        })
      })
    })
  })
})
