class Invoice < ActiveRecord::Base
  belongs_to  :contract
  has_many    :timesheets
  has_many    :timesheet_logs , through: :timesheets
  has_one     :company        , through: :company

  validate :date_validation
  validates_numericality_of :total_amount, :commission_amount , :billing_amount , presence: true, greater_than_or_equal_to: 1
  # validate :contract_validation , if: Proc.new{|invoice| !invoice.contract.in_progress?}

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

end
