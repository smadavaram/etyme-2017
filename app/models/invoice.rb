class Invoice < ActiveRecord::Base

  include Rails.application.routes.url_helpers

  enum status: [:pending_submission,:submitted, :paid , :partially_paid , :cancelled ]

  belongs_to  :contract
  belongs_to  :submitted_by   , class_name:"Admin", foreign_key: :submitted_by
  belongs_to  :parent_invoice , class_name: "Invoice" , foreign_key: :parent_id
  has_one     :child_invoice  , class_name: "Invoice", foreign_key: :parent_id
  has_one     :company        , through: :company
  has_many    :timesheets
  has_many    :timesheet_logs , through: :timesheets


  before_validation :set_rate , on: :create
  before_validation :set_consultant_and_total_amount, on: :create , if: Proc.new{|invoice| !invoice.contract.has_child?}
  # before_validation :set_total_amount , on: :create , if: Proc.new{|invoice| !invoice.contract.has_child?}
  before_validation :set_commissions , on: :create , if: Proc.new{|invoice| !invoice.contract.has_child?}
  before_validation :set_start_date_and_end_date , on: :create , if: Proc.new{|invoice| !invoice.contract.has_child?}

  after_create      :set_next_invoice_date , if: Proc.new{|invoice| !invoice.contract.has_child?}
  after_create      :update_timesheet_status_to_invoiced , if: Proc.new{|invoice| !invoice.contract.has_child?}
  after_create      :notify_contract_responder
  after_update      :create_invoice_for_parent, if: Proc.new{|invoice| invoice.status_changed? && invoice.submitted? && invoice.contract.parent_contract?}
  after_update      :notify_contract_creator , if: Proc.new{ |invoice| invoice.status_changed?  && invoice.submitted?}

  validate :start_date_cannot_be_less_than_end_date
  validate :contract_validation , if: Proc.new{|invoice| !invoice.contract.in_progress?}
  validates_numericality_of :total_amount , :rate , presence: true, greater_than_or_equal_to: 1
  validates_numericality_of :billing_amount



  def set_consultant_and_total_amount
    assignee_rate    = self.contract.assignee.hourly_rate
    contract_rate    = self.contract.rate
    total_time_in_sec = 0.0
    self.contract.timesheets.approved.not_invoiced.each{ |t| total_time_in_sec += t.approved_total_time }
    self.total_approve_time = total_time_in_sec
    self.consultant_amount = assignee_rate * (total_time_in_sec/3600.0)
    self.total_amount = (total_time_in_sec / 3600.0) * contract_rate
  end

  # private

  def start_date_cannot_be_less_than_end_date
      errors.add(:start_date, ' cannot be less than end date.') if self.end_date < self.start_date
  end

  def contract_validation
      errors.add(:base , "Contract is #{self.contract.status.humanize}" )
  end

  # def set_total_amount
    # timesheets      = self.contract.timesheets.approved.not_invoiced || []
    # timesheets.each do |t|
    #   # self.total_amount += t.total_amount
    #   self.total_amount += t.approved_total_time
    # end
    # self.total_amount = (self.total_approve_time / 3600.0) * self.rate
  # end

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
    self.billing_amount    = self.total_amount - self.commission_amount - self.consultant_amount
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
    self.start_date   = self.contract.invoices.empty? ? self.contract.start_date : (self.contract.invoices.last.end_date + 1)
    self.end_date     = self.contract.next_invoice_date
  end

  def set_rate
    self.rate = self.contract.rate
  end

  def create_invoice_for_parent
    invoice = self.contract.parent_contract.invoices.new
    invoice.start_date         = self.start_date
    invoice.end_date           = self.end_date
    invoice.total_approve_time = self.total_approve_time
    invoice.total_amount       = invoice.contract.rate * (self.total_approve_time / 3600.0)
    invoice.consultant_amount  = self.total_amount
    invoice.billing_amount     = invoice.total_amount - invoice.consultant_amount
    invoice.parent_id          = self.id
    invoice.save
  end

  def notify_contract_responder
    self.contract.respond_by.notifications.create(message: "Your <a href='http://#{self.contract.respond_by.company.etyme_url + contract_invoice_path(self.contract , self)}'>Invoice</a> for <a href='http://#{self.contract.respond_by.company.etyme_url + contract_path(self.contract)}'>contract</a>",title: "Invoice# #{self.id}")
  end

  def notify_contract_creator
    self.contract.created_by.notifications.create(message: "Your <a href='http://#{self.contract.created_by.company.etyme_url + contract_invoice_path(self.contract , self)}'>Invoice</a> for <a href='http://#{self.contract.created_by.company.etyme_url + contract_path(self.contract)}'>contract</a>",title: "Invoice# #{self.id}")
  end

end
