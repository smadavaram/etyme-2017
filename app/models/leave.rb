class Leave < ActiveRecord::Base
  enum status: { pending: 0, accepted: 1 , rejected: 2 }

  #validations
  validates :from_date ,:till_date,presence: true
  validates :from_date, date: { after_or_equal_to: Proc.new{Date.today}, message: 'Start Date Can not be before today'}
  validates :till_date, date: { after_or_equal_to: :from_date, message: 'End Date shoud be atleast equal to '+Date.today.to_s }

  #Associations
  belongs_to :user
  has_one    :company , through: :user

  #Scopes
  scope :pending , -> {where(status: 0)}
  scope :accepted , -> {where(status: 1)}
  scope :rejected , -> {where(status: 2)}


  def is_pending?
    self.status=='pending'
  end
  def accepted!
    self.update_column(:status,1)
  end
  def rejected!
    self.update_column(:status,2)
  end
end
