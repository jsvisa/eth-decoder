'use client'

import { useState } from 'react'
import yaml from 'js-yaml'
import styles from './page.module.css'

export default function Home() {
  const [inputData, setInputData] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [multicall, setMulticall] = useState(false)
  const [withAbi, setWithAbi] = useState(false)
  const [withSign, setWithSign] = useState(false)
  const [isYaml, setIsYaml] = useState(false)
  const [copied, setCopied] = useState(false)

  const syntaxHighlight = (json) => {
    if (typeof json !== 'string') {
      json = JSON.stringify(json, null, 2)
    }

    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = styles.jsonNumber
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = styles.jsonKey
          } else {
            cls = styles.jsonString
          }
        } else if (/true|false/.test(match)) {
          cls = styles.jsonBoolean
        } else if (/null/.test(match)) {
          cls = styles.jsonNull
        }
        return `<span class="${cls}">${match}</span>`
      }
    )
  }

  const syntaxHighlightYaml = (yamlStr) => {
    const escapeHtml = (str) => {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    // Process line by line
    const lines = yamlStr.split('\n').map(line => {
      let result = ''

      // Comments
      if (line.trim().startsWith('#')) {
        return `<span class="${styles.yamlComment}">${escapeHtml(line)}</span>`
      }

      // Match key-value pairs: key:value or key: value
      const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+)(\s*):(.*)?$/)
      if (keyMatch) {
        const [, indent, key, spaceAfterKey, valueAfterColon] = keyMatch
        result = `${indent}<span class="${styles.yamlKey}">${escapeHtml(key)}</span>${spaceAfterKey}<span class="${styles.yamlPunctuation}">:</span>`

        if (valueAfterColon) {
          // Process the value part
          let value = valueAfterColon

          // Hexadecimal numbers
          value = value.replace(/\b(0x[0-9a-fA-F]+)\b/g, (match) => {
            return `<span class="${styles.yamlNumber}">${escapeHtml(match)}</span>`
          })

          // Regular numbers (only if not already wrapped)
          value = value.replace(/(?<!<[^>]*)\b(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)\b(?![^<]*<\/span>)/g, (match) => {
            return `<span class="${styles.yamlNumber}">${escapeHtml(match)}</span>`
          })

          // Booleans
          value = value.replace(/\b(true|false|yes|no|on|off)\b/g, (match) => {
            return `<span class="${styles.yamlBoolean}">${escapeHtml(match)}</span>`
          })

          // Null
          value = value.replace(/\b(null|~)\b/g, (match) => {
            return `<span class="${styles.yamlNull}">${escapeHtml(match)}</span>`
          })

          // Escape any remaining non-span content
          const parts = value.split(/(<span[^>]*>.*?<\/span>)/g)
          value = parts.map((part, idx) => {
            if (idx % 2 === 0) {
              // This is content between spans, escape it
              return escapeHtml(part)
            }
            // This is a span tag, keep it as is
            return part
          }).join('')

          result += value
        }

        return result
      }

      // List items
      const listMatch = line.match(/^(\s*)(-)(\s)(.*)$/)
      if (listMatch) {
        const [, indent, dash, space, content] = listMatch
        return `${indent}<span class="${styles.yamlPunctuation}">${dash}</span>${space}${escapeHtml(content)}`
      }

      // Plain content
      return escapeHtml(line)
    })

    return lines.join('\n')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!inputData.trim()) {
      setError('Please enter some data')
      return
    }

    // Validate hex string
    const hexPattern = /^(0x)?[0-9a-fA-F]+$/
    const cleanInput = inputData.trim()

    if (!hexPattern.test(cleanInput)) {
      setError('Input must be a valid hexadecimal string')
      return
    }

    // Check length (accounting for optional 0x prefix)
    const dataWithoutPrefix = cleanInput.startsWith('0x') ? cleanInput.slice(2) : cleanInput
    if (dataWithoutPrefix.length < 8) {
      setError('Input must be at least 8 hex characters (4 bytes) long')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const params = new URLSearchParams({
        data: inputData,
        multicall: multicall,
        with_abi: withAbi,
        with_sign: withSign
      })

      const response = await fetch(`/api/decode?${params}`)

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // Check if response has the expected structure
      if (data.msg === 'ok' && Array.isArray(data.data) && data.data.length >= 1) {
        // Only display data[0]
        setResult(data.data[0])
      } else {
        // Display the full response
        setResult(data)
      }
      setIsYaml(false) // Reset to JSON format on new result
      setCopied(false) // Reset copied state
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      const textToCopy = isYaml
        ? yaml.dump(result, { indent: 2 })
        : JSON.stringify(result, null, 2)

      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getDisplayContent = () => {
    if (isYaml) {
      const yamlStr = yaml.dump(result, { indent: 2 })
      return syntaxHighlightYaml(yamlStr)
    }
    return syntaxHighlight(result)
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>EVM Tx.input Decoder App</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            value={inputData}
            onChange={(e) => setInputData(e.target.value)}
            placeholder="Enter hex data to decode (e.g., 0x1234abcd...)"
            className={styles.input}
            disabled={loading}
          />

          <div className={styles.options}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={multicall}
                onChange={(e) => setMulticall(e.target.checked)}
                disabled={loading}
              />
              <span>Multicall</span>
            </label>

            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={withAbi}
                onChange={(e) => setWithAbi(e.target.checked)}
                disabled={loading}
              />
              <span>With ABI</span>
            </label>

            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={withSign}
                onChange={(e) => setWithSign(e.target.checked)}
                disabled={loading}
              />
              <span>With Sign</span>
            </label>
          </div>

          <button
            type="submit"
            className={styles.button}
            disabled={loading}
          >
            {loading ? 'Decoding...' : 'Decode'}
          </button>
        </form>

        {error && (
          <div className={styles.error}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div className={styles.result}>
            <div className={styles.resultHeader}>
              <h2>Result:</h2>
              <div className={styles.resultActions}>
                <button
                  onClick={() => setIsYaml(!isYaml)}
                  className={styles.actionButton}
                  type="button"
                >
                  {isYaml ? 'Convert to JSON' : 'Convert to YAML'}
                </button>
                <button
                  onClick={handleCopy}
                  className={styles.actionButton}
                  type="button"
                >
                  {copied ? 'Copied!' : `Copy ${isYaml ? 'YAML' : 'JSON'}`}
                </button>
              </div>
            </div>
            <pre
              className={styles.json}
              dangerouslySetInnerHTML={{ __html: getDisplayContent() }}
            />
          </div>
        )}
      </div>
    </main>
  )
}
