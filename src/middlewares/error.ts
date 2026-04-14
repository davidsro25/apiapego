import { FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { logger } from '../utils/logger'

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Erros de validação Zod
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
  }

  // Erros do Fastify (404, 405, etc.)
  const statusCode = (error as FastifyError).statusCode || 500

  if (statusCode < 500) {
    return reply.status(statusCode).send({
      error: error.name || 'Error',
      message: error.message,
    })
  }

  // Erros de negocio conhecidos — retorna mensagem real
  const knownErrors = [
    'not connected', 'Instance status:', 'nao esta no WhatsApp', 'not registered',
    'Numero invalido', 'Invalid phone', 'not found', 'Instance not found'
  ]
  const isKnownError = knownErrors.some(e => error.message?.toLowerCase().includes(e.toLowerCase()))

  if (isKnownError) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: error.message,
    })
  }

  // Erro interno — loga e retorna mensagem real (util para debug)
  logger.error({ err: error, url: request.url, method: request.method }, 'Internal server error')

  return reply.status(500).send({
    error: 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
  })
}
