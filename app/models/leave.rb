class Leave < ActiveRecord::Base
  enum status: { pending: 0, accepted: 1 , rejected: 2 }

  validates :from_date ,:till_date,presence: true
  # validates :from_date, date: { after_or_equal_to: Proc.new{Date.today}, message: 'Start date can not be before today'}
  validates :till_date, date: { after_or_equal_to: :from_date, message: 'End date should be greater then start date'}

  belongs_to :user
  has_one :company , through: :user

end
