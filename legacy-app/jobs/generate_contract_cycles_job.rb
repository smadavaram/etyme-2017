# frozen_string_literal: true

class GenerateContractCyclesJob < ApplicationJob
  queue_as :default
  before_perform :job_start
  after_perform :job_complete

  def perform(contract)
    begin
      contract.create_cycles
    rescue StandardError => e
      arguments.first.update(cc_job: :errored)
      logger.error e.message
      e.backtrace.each { |line| logger.error line }
      ExceptionNotifier.notify_exception(
        e,
        data: { payload: contract }
      )
    end
  end

  private

  def job_start
    arguments.first.update(cc_job: :started)
  end

  def job_complete
    arguments.first.notify_contract_companies if arguments.first.update!(cc_job: :finished, status: :in_progress)
  end
end
