class Invoice < ActiveRecord::Base
  belongs_to  :contract
  has_many    :timesheets
  has_many    :timesheet_logs , through: :timesheets
  has_one     :company        , through: :company
  before_validation :set_total_amount
  before_validation :set_commissions
  before_validation :set_start_date_and_end_date
  after_create :set_next_invoice_date
  after_create :update_timesheet_status_to_invoiced

  validate :date_validation
  validates_numericality_of :total_amount , :billing_amount , presence: true, greater_than_or_equal_to: 1
  validate :contract_validation , if: Proc.new{|invoice| !invoice.contract.in_progress?}

  private

  def date_validation
    if self.end_date < self.start_date
      errors.add(:start_date, ' cannot be less than end date.')
      return false
    else
      return true
    end
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
