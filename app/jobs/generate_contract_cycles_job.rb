# frozen_string_literal: true

class GenerateContractCyclesJob < ApplicationJob
  queue_as :h_contracts
  before_perform :job_start
  after_perform :job_complete

  def perform(contract)
    contract.create_cycles
  rescue StandardError => e
    arguments.first.update(cc_job: :errored)
    ExceptionNotifier.notify_exception(
      e,
      data: { payload: contract }
    )
  end

  private

  def job_start
    arguments.first.update(cc_job: :started)
  end

  def job_complete
    arguments.first.notify_contract_companies if arguments.first.update(cc_job: :finished, status: :in_progress)
  end
end
