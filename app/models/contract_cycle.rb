# frozen_string_literal: true

# == Schema Information
#
# Table name: contract_cycles
#
#  id               :bigint           not null, primary key
#  contract_id      :bigint
#  company_id       :bigint
#  candidate_id     :bigint
#  note             :text
#  cycle_type       :string
#  cycle_date       :datetime
#  cyclable_type    :string
#  cyclable_id      :bigint
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  completed_at     :datetime
#  start_date       :datetime
#  end_date         :datetime
#  next_date        :datetime
#  next_action      :string
#  next_action_date :datetime
#  doc_date         :date
#  post_date        :date
#  cycle_frequency  :bigint
#  status           :integer          default("pending")
#  cycle_of_type    :string
#  cycle_of_id      :bigint
#  user_id          :bigint
#
class ContractCycle < ApplicationRecord
  CYCLETYPES = %w[TimesheetSubmit TimesheetApprove InvoiceGenerate
                  SalaryCalculation SalaryProcess SalaryClear CommissionCalculation
                  CommissionProcess CommissionClear VendorBillCalculation ClientBillCalculation
                  VendorPaymentProcess VendorBillClear ClientPaymentProcess ClientBillClear
                  ClientExpenseCalculation ClientExpenseApprove ClientExpenseInvoice ClientExpenseSubmission].freeze

  enum cycle_frequency: ['daily', 'weekly', 'biweekly', 'monthly', 'twice a month']
  enum status: %i[pending completed rejected approved]

  CYCLETYPES.each do |method_name|
    define_singleton_method method_name do |id|
      ContractCycle.where(cycle_type: method_name, contract_id: id)
    end
  end

  belongs_to :contract, optional: true
  belongs_to :company, optional: true
  belongs_to :candidate, optional: true
  belongs_to :user, optional: true
  belongs_to :cyclable, polymorphic: true, optional: true, dependent: :destroy
  belongs_to :cycle_of, polymorphic: true

  has_many :ts_submitteds, foreign_key: :ts_cycle_id, class_name: 'Timesheet'
  has_many :ta_approveds, foreign_key: :ta_cycle_id, class_name: 'Timesheet'

  validates :cycle_type, uniqueness: { scope: %i[cyclable_type cyclable_id] }, if: proc { |cc| cc.cyclable_type.present? }
  validates :cycle_type,
            presence: true,
            inclusion: { in: CYCLETYPES }

  scope :pending, -> { where(status: 'pending') }
  scope :pending_with_submit, -> { where("status = ? OR status = ? ", 0, 1) }
  scope :candidate_id, ->(candidate_id) { where candidate_id: candidate_id }
  scope :contract_id, ->(contract_id) { where contract_id: contract_id }
  scope :note, ->(note) { where cycle_type: note }
  scope :cycle_type, ->(type) { (type == 'All') || type.nil? ? where(cycle_type: ContractCycle::CYCLETYPES) : where(cycle_type: type) }
  scope :approved, -> { where(status: 'approved') }
  scope :approved_not, -> { where.not(status: 'approved') }
  scope :approved_and_completed, -> { where('status = ? OR status = ?', 1, 3) }
  scope :not_approved_and_completed, -> { where.not('status = ? OR status = ?', 1, 3) }
  scope :completed, -> { where(status: 'completed') }
  scope :overdue, -> { where('DATE(contract_cycles.end_date) < ?', DateTime.now.end_of_day.to_date) }
  scope :todo, -> { where('DATE(contract_cycles.end_date) BETWEEN ? AND ?', Date.today.beginning_of_day, Date.today.end_of_day) }
  scope :todo_with_completed, -> { where('DATE(contract_cycles.end_date) BETWEEN ? AND ? OR status = ?', Date.today.beginning_of_day, Date.today.end_of_day, 1) }
  scope :todo_not, -> { where.not('DATE(contract_cycles.end_date) BETWEEN ? AND ?', Date.today.beginning_of_day, Date.today.end_of_day) }

  def next_action=(new_next_action)
    write_attribute(:next_action, new_next_action)
    self.next_action_date = get_next_action_date(new_next_action) unless next_action_date.present?
  end

  def self.get_cycle_types
    CYCLETYPES
  end

  def color
    ContractCycle.color(cycle_type)
  end

  def self.color(type)
    case type
    when 'SalaryProcess'
      'red'
    when 'SalaryCalculation'
      'green'
    when 'TimesheetSubmit'
      '#FF7F50'
    when 'TimesheetApprove'
      '#CD5C5C'
    when 'InvoiceGenerate'
      '#F08080'
    when 'SalaryClear'
      '#FFA500'
    when 'CommissionCalculation'
      '#EEE8AA'
    when 'CommissionProcess'
      '#ADFF2F'
    when 'CommissionClear'
      '#00FF7F'
    when 'VendorBillCalculation'
      '#00FFFF'
    when 'ClientBillCalculation'
      '#8A2BE2'
    when 'VendorPaymentProcess'
      '#DDA0DD'
    when 'VendorBillClear'
      '#FFC0CB'
    when 'ClientPaymentProcess'
      '#DEB887'
    when 'ClientBillClear'
      '#B0C4DE'
    when 'ClientExpenseCalculation'
      '#F0FFFF'
    when 'ClientExpenseApprove'
      '#808080'
    when 'ClientExpenseInvoice'
      '#CD853F'
    when 'ClientExpenseSubmission'
      '#FF1493'
    end
  end

  def sell_contract?
    cycle_of_type == 'SellContract'
  end

  def buy_contract?
    cycle_of_type == 'BuyContract'
  end

  def get_next_action_date(new_next_action)
    case new_next_action
    when 'TimesheetApprove'
      ''
    when 'InvoiceGenerate'
      get_next_invoice_generate_date
    else
      ''
    end
  end

  def self.get_post_date(value, frequency, start_date, end_date)
    Cycle::Utils::DateUtils.get_date(value, frequency, start_date, end_date)
  end

  def get_next_invoice_generate_date
    ig = contract.contract_cycles.where(cycle_type: 'InvoiceGenerate').where('cycle_date >= ?', end_date).order(:cycle_date).first
    if ig.present?
      ig.cycle_date
    else
      sell_contract = contract.sell_contract
      contract.find_next_date(sell_contract.invoice_terms_period, sell_contract.invoice_date_1, sell_contract.invoice_date_2, sell_contract.invoice_end_of_month, sell_contract.invoice_day_of_week, cycle_date)
    end
  end
end
