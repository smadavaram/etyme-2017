class Leave < ActiveRecord::Base
  enum status: [ :pending, :accepted  ,:rejected]

  validates :status ,             inclusion: {in: statuses.keys}
  validates :from_date ,:till_date,presence: true
  # validates :from_date, date: { after_or_equal_to: Proc.new{Date.today}, message: 'Start date can not be before today'}
  validates :till_date, date: { after_or_equal_to: :from_date, message: 'End date should be greater then start date'}
  validate  :date_overlap , on: :create

  belongs_to :user
  has_one :company , through: :user

  private

  def date_overlap
    if check_dates_overlap?
      errors.add(:base,"Leave already present in that time span!")
      return false
    else
      return true
    end
  end
  def check_dates_overlap?
    self.user.leaves.all.each do |t|
      if self.from_date.between?(t.from_date,t.till_date)
        return true
      elsif  self.till_date.between?(t.from_date,t.till_date)
        return true
      end #end of if
    end #end of each
    return false
  end
end
