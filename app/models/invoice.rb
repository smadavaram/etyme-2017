class Invoice < ActiveRecord::Base

  enum status: [:pending_submission,:submitted, :paid , :partially_paid , :cancelled ]

  belongs_to  :contract
  has_many    :timesheets
  has_many    :timesheet_logs , through: :timesheets
  has_one     :company        , through: :company
  belongs_to  :submitted_by   , class_name:"Admin", foreign_key: :submitted_by

  before_validation :set_total_amount , on: :create
  before_validation :set_commissions , on: :create
  before_validation :set_start_date_and_end_date , on: :create
  before_validation :set_consultant_amount, on: :create
  after_create      :set_next_invoice_date
  after_create      :update_timesheet_status_to_invoiced

  validate :start_date_cannot_be_less_than_end_date
  validate :contract_validation , if: Proc.new{|invoice| !invoice.contract.in_progress?}
  validates_numericality_of :total_amount , :billing_amount , presence: true, greater_than_or_equal_to: 1



  def set_consultant_amount
    rate = self.contract.assignee.hourly_rate
    hours = 0.0
    self.contract.timesheets.approved.not_invoiced.each{ |t| hours += t.approved_total_hours }
    self.consultant_amount = rate * hours
  end

  private

  def start_date_cannot_be_less_than_end_date
      errors.add(:start_date, ' cannot be less than end date.') if self.end_date < self.start_date
  end

  def contract_validation
      errors.add(:base , "Contract is #{self.contract.status.humanize}" )
  end

  def set_total_amount
    timesheets      = self.contract.timesheets.approved.not_invoiced || []
    timesheets.each do |t|
      self.total_amount += t.total_amount
    end
  end

  def set_commissions
    commission = 0.0
    if self.contract.is_commission
      if self.contract.fixed? && self.contract.invoices.empty?
        commission = self.contract.commission_amount
      elsif contract.percentage? && self.contract.invoices.sum(:commission_amount) < self.contract.max_commission
        commission = self.total_amount * 0.01 * self.contract.commission_amount
        commission = commission + self.contract.invoices.sum(:commission_amount) > (self.contract.max_commission) ? (self.contract.max_commission - self.contract.invoices.sum(:commission_amount)) : commission
      end
    end
    self.commission_amount = commission
    self.billing_amount    = self.commission_amount + self.total_amount
  end

  def set_next_invoice_date
    temp_date = self.contract.next_invoice_date + TIMESHEET_FREQUENCY[self.contract.time_sheet_frequency].days
    self.contract.next_invoice_date = temp_date > self.contract.end_date ? self.contract.end_date : temp_date
    self.contract.save
  end

  def update_timesheet_status_to_invoiced
    timesheets  = self.contract.timesheets.approved.not_invoiced || []
    timesheets.each do |t|
      t.update_attributes!(invoice_id:  self.id, status: 'invoiced')
    end
  end

  def set_start_date_and_end_date
    self.start_date   = self.contract.invoices.empty? ? self.contract.start_date : self.contract.invoices.last.end_date + 1
    self.end_date     = self.contract.next_invoice_date
  end

end
