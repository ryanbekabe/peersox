import WebSocket from 'isomorphic-ws'
import { HANDSHAKE_SUCCESS, HANDSHAKE_FAILED } from './../common/settings'

import Connection from './Connection'

/**
 * A WebRTC/WebSocket peer connection.
 *
 * @extends Connection
 */
class ConnectionSocket extends Connection {
  constructor ({
    url = 'ws://localhost:3000/peersox/',
    timeout = 10000,
    debug = false
  } = {}) {
    super(debug, 'WebSocket')

    this.socket = null
    this.url = url
    this.timeoutDuration = timeout
    this.timeout = null
    this.closingTimeout = null
  }

  get status () {
    return {
      url: this.url,
      socket: this.socket,
      isConnected: this.isConnected()
    }
  }

  /**
   * Connect to the WebSocket server and perform a handshake with the given
   * pairing.
   *
   * This method will attach temporary listeners on the WebSocket instance.
   * These are used for the handshake with the server and to resolve or reject
   * the promise. If the handshake is successful, the WebSocket instance is
   * passed to a method where the permanent listeners are attached.
   *
   * The server will automatically close the connection when the handshake
   * fails.
   *
   * @param {Pairing} pairing The pairing to use for the WebSocket connection.
   * @returns {Promise}
   */
  connect (pairing, token) {
    return new Promise((resolve, reject) => {
      // Initialize a new WebSocket connection.
      let socket = new WebSocket(this.url, [token])
      socket.binaryType = 'arraybuffer'

      // Add event listener for when socket connection is opened.
      socket.onopen = () => {
        this.sendInternalEvent('client.register', pairing, socket)
      }

      // Add a temporary error handler to reject the promise when the connection
      // failed.
      socket.onerror = (error) => {
        window.clearTimeout(this.timeout)
        this._handleError()
        return reject(error)
      }

      // Add a temporary message handler to listen for the handshake response
      // from the server and resolve or reject the promise.
      socket.onmessage = (message) => {
        window.clearTimeout(this.timeout)

        if (message.data === HANDSHAKE_SUCCESS) {
          this.initPeerConnection(socket)
          return resolve(pairing)
        } else if (message.data === HANDSHAKE_FAILED) {
          return reject(new Error('Invalid pairing'))
        } else {
          return reject(new Error('Connection failed'))
        }
      }

      // If for whatever reason everything fails, set up a timeout that will
      // still reject the promise and clean up.
      this.timeout = window.setTimeout(() => {
        if (!this.isConnected()) {
          return reject(new Error('Connection timed out'))
        }
      }, this.timeoutDuration)
    })
  }

  /**
   * Initialize the WebSocket connection after the handshake was successful.
   *
   * @param {WebSocket} socket The WebSocket instance.
   */
  initPeerConnection (socket) {
    this._handleConnected()

    socket.onerror = this._handleSocketError.bind(this)
    socket.onclose = this._handleSocketClose.bind(this)
    socket.onmessage = (e) => {
      this._handleIncomingMessage(e.data)
    }

    this.socket = socket
  }

  /**
   * Send data to the WebSocket server.
   *
   * @param {String|ArrayBuffer} data The data to send to the server.
   */
  send (data) {
    if (this.socket.readyState === 1) {
      this.socket.send(data)
    }
  }

  /**
   * Send the signaling data from the RTC connection to the server. It will
   * directly pass it to the peer.
   *
   * @param {object} signal The signaling data.
   */
  sendSignal (signal) {
    this.sendInternalEvent('peer.signal', signal, this.socket)
  }

  /**
   * Handle the error event of the WebSocket connection.
   *
   * @param {Error} error The error.
   */
  _handleSocketError (error) {
    this._handleError(error)
  }

  /**
   * Handle the close event of the WebSocket connection.
   */
  _handleSocketClose () {
    window.clearTimeout(this.closingTimeout)
    window.clearTimeout(this.timeout)
    this._handleClose()
  }

  /**
   * Close the WebSocket connection.
   */
  close () {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        this._debug('Info', 'Not connected, can not close connection')
        return resolve()
      }

      this.socket.close()

      resolve()
    })
  }

  /**
   * Return the connected WebSocket socket.
   *
   * @returns {WebSocket}
   */
  getSocket () {
    return this.socket
  }
}

ConnectionSocket.IS_SUPPORTED = 'WebSocket' in window || 'MozWebSocket' in window

export default ConnectionSocket
