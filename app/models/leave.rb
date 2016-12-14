class Leave < ActiveRecord::Base
  enum status: { pending: 0, accepted: 1 , rejected: 2 }

  #validations
  validates :from_date ,:till_date,presence: true
  # validates :from_date, date: { after_or_equal_to: Proc.new{Date.today}, message: 'Start date can not be before today'}
  validates :till_date, date: { after_or_equal_to: :from_date, message: 'End date should be greater then start date'}

  #Associations
  belongs_to :user
  has_one :company , through: :user

  #Scopes
  scope :pending , -> {where(status: 0)}
  scope :accepted , -> {where(status: 1)}
  scope :rejected , -> {where(status: 2)}

  def is_pending?
    self.pending?
  end

  # def accepted!
  #   self.update_column(:status, 1)
  # end

  # def rejected!
  #   self.update_column(:status, 2)
  # end
end
