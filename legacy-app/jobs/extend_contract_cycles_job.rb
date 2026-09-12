# frozen_string_literal: true

class ExtendContractCyclesJob < ApplicationJob
  queue_as :h_contracts
  before_perform :job_start
  after_perform :job_complete

  def perform(contract, extended_data)
    contract.extend_cycles(Date.parse(extended_data))
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
    contract = arguments.first
    return unless contract.update(cc_job: :finished, status: :in_progress, end_date: arguments.second)

    contract.extended_contract_notification
    contract.create_activity(key: 'contracts.expand', owner: contract.created_by, params: arguments.second)
  end
end
