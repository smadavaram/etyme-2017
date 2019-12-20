class ExtendContractCyclesJob < ApplicationJob

  queue_as :h_contracts
  before_perform :job_start
  after_perform :job_complete

  def perform(contract,extended_data)
    begin
      contract.extend_cycles(Date.parse(extended_data))
    rescue => e
      self.arguments.first.update(cc_job: :errored)
      ExceptionNotifier.notify_exception(
          e,
          data: {payload: contract}
      )
    end
  end

  private

  def job_start
    self.arguments.first.update(cc_job: :started)
  end

  def job_complete
    contract = self.arguments.first
    if contract.update(cc_job: :finished, status: :in_progress, end_date: self.arguments.second)
      contract.extended_contract_notification
      contract.create_activity( key: "contracts.expand",owner: contract.created_by, params: self.arguments.second)
    end
  end

end
