class Invoice < ApplicationRecord
  
  include Rails.application.routes.url_helpers
  
  enum status: [:pending_invoice, :open, :submitted, :paid, :partially_paid, :cancelled]
  enum invoice_type: [:timesheet_invoice, :client_expense_invoice]
  
  belongs_to :contract, optional: true
  belongs_to :submitted_by, class_name: "Admin", foreign_key: :submitted_by, optional: true
  belongs_to :parent_invoice, class_name: "Invoice", foreign_key: :parent_id, optional: true
  belongs_to :sender_company, class_name: "Company", foreign_key: "sender_company_id"
  belongs_to :receiver_company, class_name: "Company", foreign_key: "receiver_company_id"
  has_one :child_invoice, class_name: "Invoice", foreign_key: :parent_id
  has_many :invoice_items
  has_many :timesheets, through: :invoice_items, source: :itemable ,source_type: "Timesheet"
  has_many :client_expenses, through: :invoice_items, source: :itemable ,source_type: "ClientExpense"
  has_many :receive_payments
  has_one :contract_cycle, as: :cyclable

  # before_validation :set_rate , on: :create
  # before_validation :set_consultant_and_total_amount, on: :create , if: Proc.new{|invoice| !invoice.contract.has_child?}
  # before_validation :set_total_amount , on: :create , if: Proc.new{|invoice| !invoice.contract.has_child?}
  # before_validation :set_commissions , on: :create , if: Proc.new{|invoice| !invoice.contract.has_child?}
  # before_validation :set_start_date_and_end_date , on: :create , if: Proc.new{|invoice| !invoice.contract.has_child?}
  
  # after_create      :set_next_invoice_date , if: Proc.new{|invoice| !invoice.contract.has_child?}
  # after_create      :update_timesheet_status_to_invoiced , if: Proc.new{|invoice| !invoice.contract.has_child?}
  # after_create      :notify_contract_responder ,  if: Proc.new{|invoice| invoice.contract.respond_by.present?}
  # after_update      :create_invoice_for_parent, if: Proc.new{|invoice| invoice.status_changed? && invoice.submitted? && invoice.contract.parent_contract?}
  # after_update      :notify_contract_creator , if: Proc.new{ |invoice| invoice.status_changed?  && invoice.submitted?}
  
  before_create :set_number
  
  validate :start_date_cannot_be_less_than_end_date
  # validate :contract_validation , if: Proc.new{|invoice| !invoice.contract.in_progress?}
  # validates_numericality_of :total_amount , :rate , presence: true, greater_than_or_equal_to: 1
  validates_numericality_of :billing_amount
  
  scope :open_invoices, -> { where(status: [:pending_invoice, :open]) }
  scope :cleared_invoices, -> { where(status: [:paid]) }
  scope :submitted_invoices, -> { where(status: :open) }
  scope :all_invoices, -> {where(status: [:open, :submitted, :paid, :partially_paid, :cancelled] )}
  
  def set_total_amount_hours
    update(total_amount: timesheets.sum(:amount),total_approve_time: timesheets.sum(:total_time))
  end
  
  def update_payment_receive
    # debugger
    status = :partially_paid
    paid = receive_payments.sum(:amount_received)
    if total_amount <= paid
      status = :paid
      contract_cycle.completed!
    end
    update(billing_amount: paid, balance: total_amount - paid,status: status )
  end
  
  def set_number
    i = self.contract.invoices.order("created_at DESC").first
    if i.present?
      self.number = "IN_" + self.contract.only_number.to_s + "_" + (i.only_number.to_i + 1).to_s.rjust(3, "0")
    else
      self.number = "IN_" + self.contract.only_number.to_s + "_001"
    end
  end
  
  def only_number
    self.number.split("_")[2]
  end
  
  def set_seq_accept_in
    ledger = Sequence::Client.new(
        ledger_name: 'company-dev',
        credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    self.contract.set_on_seq
    tx = ledger.transactions.transact do |builder|
      builder.issue(
          flavor_id: 'tym',
          amount: (self.total_amount.to_i * 100).to_i,
          destination_account_id: "#{self.contract.buy_contract.candidate.full_name.parameterize + self.contract.buy_contract.candidate.id.to_s}_exp",
          action_tags: {
              "Fixed" => "false",
              "Status" => "open",
              "Account" => "",
              "CycleId" => self.ig_cycle_id.to_s,
              "ObjType" => "IG",
              "ContractId" => self.contract_id.to_s,
              "PostingDate" => Time.now.strftime("%m/%d/%Y"),
              "CycleFrom" => self.start_date.strftime("%m/%d/%Y"),
              "CycleTo" => self.end_date.strftime("%m/%d/%Y"),
              "Documentdate" => Time.now.strftime("%m/%d/%Y"),
              "TransactionType" => self.contract.buy_contract.contract_type == "C2C" ? "C2C" : "W2"
          }
      )
    end
  end
  
  def set_seq_paid_in
    ledger = Sequence::Client.new(
        ledger_name: ENV['seq_ledgers'],
        credential: ENV['seq_token']
    )
    
    tx = ledger.transactions.transact do |builder|
      builder.transfer(
          flavor_id: 'tym',
          amount: (self.total_amount.to_i * 100).to_i,
          destination_account_id: "#{self.contract.sell_contract.company.slug.to_s + self.contract.sell_contract.company.id.to_s}_q",
          source_account_id: "#{self.contract.buy_contract.candidate.full_name.parameterize + self.contract.buy_contract.candidate.id.to_s}_exp",
          action_tags: {
              "Fixed" => "false",
              "Status" => "Clear",
              "Account" => "",
              "CycleId" => self.ig_cycle_id.to_s,
              "ObjType" => "IP",
              "ContractId" => self.contract_id.to_s,
              "PostingDate" => Time.now.strftime("%m/%d/%Y"),
              "CycleFrom" => self.start_date.strftime("%m/%d/%Y"),
              "CycleTo" => self.end_date.strftime("%m/%d/%Y"),
              "Documentdate" => Time.now.strftime("%m/%d/%Y"),
              "TransactionType" => self.contract.buy_contract.contract_type == "C2C" ? "C2C" : "W2"
          },
      )
    end
  end
  
  def set_consultant_and_total_amount
    assignee_rate = 0 #self.contract.assignee.hourly_rate
    contract_rate = self.contract.rate
    total_time_in_sec = 0.0
    self.contract.timesheets.approved.not_invoiced.each { |t| total_time_in_sec += t.approved_total_time }
    self.total_approve_time = total_time_in_sec
    self.consultant_amount = assignee_rate * (total_time_in_sec / 3600.0)
    self.total_amount = (total_time_in_sec / 3600.0) * contract_rate
  end
  
  # private
  
  def start_date_cannot_be_less_than_end_date
    errors.add(:start_date, ' cannot be less than end date.') if self.end_date < self.start_date
  end
  
  def contract_validation
    errors.add(:base, "Contract is #{self.contract.status.humanize}")
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
    self.billing_amount = self.total_amount - self.commission_amount - self.consultant_amount
  end
  
  def set_next_invoice_date
    # temp_date = self.contract.next_invoice_date + TIMESHEET_FREQUENCY[self.contract.time_sheet_frequency].days
    temp_date = self.contract.next_invoice_date + self.contract.sell_contract.invoice_terms_period.to_i.days # TIMESHEET_FREQUENCY[self.contract.time_sheet_frequency].days
    self.contract.next_invoice_date = temp_date > self.contract.end_date ? self.contract.end_date : temp_date
    self.contract.save
  end

  def due_date
    (contract_cycle.start_date + contract.sell_contract.payment_term.days).strftime('%d/%m/%Y')
  end

  def update_timesheet_status_to_invoiced
    timesheets = self.contract.timesheets.approved.not_invoiced || []
    timesheets.each do |t|
      t.update_attributes!(invoice_id: self.id, status: 'invoiced')
    end
  end
  
  def set_start_date_and_end_date
    self.start_date = self.contract.invoices.empty? ? self.contract.start_date : (self.contract.invoices.last.end_date + 1)
    self.end_date = self.contract.next_invoice_date
  end
  
  def set_rate
    self.rate = self.contract.rate
  end
  
  def create_invoice_for_parent
    invoice = self.contract.parent_contract.invoices.new
    invoice.start_date = self.start_date
    invoice.end_date = self.end_date
    invoice.total_approve_time = self.total_approve_time
    invoice.total_amount = invoice.contract.rate * (self.total_approve_time / 3600.0)
    invoice.consultant_amount = self.total_amount
    invoice.billing_amount = invoice.total_amount - invoice.consultant_amount
    invoice.parent_id = self.id
    invoice.save
  end
  
  def notify_contract_responder
    self.contract.respond_by.notifications.create(message: "Your <a href='http://#{self.contract.respond_by.company.etyme_url + contract_invoice_path(self.contract, self)}'>Invoice</a> for <a href='http://#{self.contract.respond_by.company.etyme_url + contract_path(self.contract)}'>contract</a>", title: "Invoice# #{self.id}")
  end
  
  def notify_contract_creator
    self.contract.created_by.notifications.create(message: "Your <a href='http://#{self.contract.created_by.company.etyme_url + contract_invoice_path(self.contract, self)}'>Invoice</a> for <a href='http://#{self.contract.created_by.company.etyme_url + contract_path(self.contract)}'>contract</a>", title: "Invoice# #{self.id}")
  end
  
  def self.set_con_cycle_invoice_date(sell_contract, con_cycle)
    @invoice_type = sell_contract&.invoice_terms_period
    @invoice_day_of_week = Date.parse(sell_contract&.invoice_day_of_week&.titleize).try(:strftime, '%A')
    @invoice_date_1 = sell_contract&.invoice_date_1.try(:strftime, '%e')
    @invoice_date_2 = sell_contract&.invoice_date_2.try(:strftime, '%e')
    @invoice_end_of_month = sell_contract&.invoice_end_of_month
    @invoice_day_time = sell_contract&.invoice_day_time.try(:strftime, '%H:%M')
    # binding.pry
    case @invoice_type
      when 'daily'
        con_cycle_invoice_start_date = con_cycle&.start_date
      when 'weekly'
        con_cycle_invoice_start_date = date_of_next(@invoice_day_of_week, con_cycle)
      # binding.pry 
      when 'monthly'
        # binding.pry
        if @invoice_end_of_month
          con_cycle_invoice_start_date = con_cycle.start_date.end_of_month
        else
          con_cycle_invoice_start_date = montly_approval_date(con_cycle)
        end
      when 'twice a month'
        con_cycle_invoice_start_date = twice_a_month_approval_date(con_cycle)
      else
        con_cycle_invoice_start_date = con_cycle&.start_date
    end
    return con_cycle_invoice_start_date
  end
  
  def self.date_of_next(day_of_week, con_cycle)
    day_of_week = DateTime.parse(day_of_week).wday
    date = con_cycle.start_date.to_date + ((day_of_week - con_cycle.start_date.to_date.wday) % 7)
    if day_of_week >= con_cycle.start_date.wday
      (date - con_cycle.start_date.to_date <= 5) && con_cycle.start_date.wday != 0 ? date + 7.days : date
    else
      date
    end
  end
  
  def self.montly_approval_date(con_cycle)
    # binding.pry
    day = @invoice_date_1&.to_i.present? ? @invoice_date_1&.to_i : 0
    next_month_year = DateTime.now.strftime("%d").to_i <= day ? DateTime.now : (DateTime.now + 1.month)
    month = next_month_year&.strftime("%m").to_i
    year = next_month_year&.strftime("%Y").to_i
    con_cycle_invoice_start_date = DateTime.new(year, month, day)
  end
  
  def self.twice_a_month_approval_date(con_cycle)
    # binding.pry
    day_1 = @invoice_date_1&.to_i
    day_2 = @invoice_date_2&.to_i.present? ? @invoice_date_2&.to_i : 0
    if con_cycle.start_date.strftime("%d").to_i <= day_1
      day = @invoice_date_1&.to_i
      next_month_year = con_cycle.start_date
      month = next_month_year&.strftime("%m").to_i
      year = next_month_year&.strftime("%Y").to_i
    elsif con_cycle.start_date.strftime("%d").to_i > day_1 && con_cycle.start_date.strftime("%d").to_i <= day_2
      day = @invoice_date_2&.to_i
      next_month_year = con_cycle.start_date
      month = next_month_year&.strftime("%m").to_i
      year = next_month_year&.strftime("%Y").to_i
    elsif con_cycle.start_date.strftime("%d").to_i > day_2 && !@ta_end_of_month
      day = @invoice_date_1&.to_i
      next_month_year = con_cycle.start_date + 1.month
      month = next_month_year&.strftime("%m").to_i
      year = next_month_year&.strftime("%Y").to_i
    elsif @ta_end_of_month
      next_month_year = con_cycle.start_date.end_of_month
      day = next_month_year.strftime('%e').to_i
      month = next_month_year&.strftime("%m").to_i
      year = next_month_year&.strftime("%Y").to_i
    end
    con_cycle_ta_start_date = DateTime.new(year, month, day)
  end

end
