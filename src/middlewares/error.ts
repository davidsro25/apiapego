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

  // Erro interno - loga e retorna 500 genérico
  logger.error({ err: error, url: request.url, method: request.method }, 'Internal server error')

  return reply.status(500).send({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  })
}
