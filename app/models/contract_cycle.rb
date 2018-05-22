class ContractCycle < ApplicationRecord
  CYCLETYPES = [ "TimesheetSubmit", "TimesheetApprove", "InvoiceGenerate" ]

  belongs_to :contract, optional: true
  belongs_to :company, optional: true
  belongs_to :candidate, optional: true
  belongs_to :cyclable, polymorphic: true, optional: true

  validates :cycle_type, uniqueness: { scope: [ :cyclable_type, :cyclable_id ] }, if: Proc.new { |cc| cc.cyclable_type.present? }
  validates :cycle_type,
            presence: true,
            inclusion: { in: CYCLETYPES }

  scope :incomplete, -> {where(status: 'pending')}
  scope :completed, -> {where(status: 'completed')}

  def next_action=(new_next_action)
    write_attribute(:next_action, new_next_action)
    self.next_action_date = get_next_action_date(new_next_action) unless self.next_action_date.present?
  end

  def get_next_action_date(new_next_action)
    case new_next_action
    when 'TimesheetApprove'
      ""
    when 'InvoiceGenerate'
      get_next_invoice_generate_date
    else
      ""
    end
  end

  def get_next_invoice_generate_date
    ig = self.contract.contract_cycles.where(cycle_type: "InvoiceGenerate").where("cycle_date >= ?", self.end_date).order(:cycle_date).first
    if ig.present?
      ig.cycle_date
    else
      buy_contract = self.contract.buy_contracts.first
      self.contract.find_next_date(buy_contract.invoice_recepit, buy_contract.ir_date_1, buy_contract.ir_date_2, buy_contract.ir_end_of_month, buy_contract.ir_day_of_week, self.cycle_date)
    end
  end

end
