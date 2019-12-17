class GenerateContractCyclesJob < ApplicationJob

  queue_as :h_contracts
  before_perform :job_start
  after_perform :job_complete

  def perform(contract)
    begin
      contract.create_cycles
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
    if self.arguments.first.update(cc_job: :finished, status: :in_progress)
      self.arguments.first.notify_contract_companies
    end
  end

end
