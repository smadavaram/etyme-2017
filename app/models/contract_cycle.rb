class ContractCycle < ApplicationRecord
  CYCLETYPES = [ "TimesheetSubmit", "TimesheetApprove", "InvoiceGenerate", "SalaryCalculation", 'SalaryProcess', 'SalaryClear', 'CommissionCalculation', 'CommissionProcess', 'CommissionClear', 'VendorBillCalculation', 'ClientBillCalculation', 'VendorPaymentProcess', 'VendorBillClear'  ]

  belongs_to :contract, optional: true
  belongs_to :company, optional: true
  belongs_to :candidate, optional: true
  belongs_to :cyclable, polymorphic: true, optional: true

  has_many :ts_submitteds, foreign_key: :ts_cycle_id, class_name: 'Timesheet'
  has_many :ta_approveds, foreign_key: :ta_cycle_id, class_name: 'Timesheet'

  validates :cycle_type, uniqueness: { scope: [ :cyclable_type, :cyclable_id ] }, if: Proc.new { |cc| cc.cyclable_type.present? }
  validates :cycle_type,
            presence: true,
            inclusion: { in: CYCLETYPES }

  scope :pending, -> {where(status: 'pending')}

  scope :candidate_id, -> (candidate_id) { where candidate_id: candidate_id }
  scope :contract_id, -> (contract_id) { where contract_id: contract_id }
  scope :note, -> (note) {where note: note}

  scope :completed, -> {where(status: 'completed')}
  scope :overdue, -> {where('DATE(contract_cycles.end_date) < ?', DateTime.now.end_of_day.to_date)}
  scope :todo, -> {where('DATE(contract_cycles.end_date) BETWEEN ? AND ?', Date.today, 11.days.from_now.to_date)}

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
      sell_contract = self.contract.sell_contracts.first
      self.contract.find_next_date(sell_contract.invoice_terms_period, sell_contract.invoice_date_1, sell_contract.invoice_date_2, sell_contract.invoice_end_of_month, sell_contract.invoice_day_of_week, self.cycle_date)
    end
  end

end
