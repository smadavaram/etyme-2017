# frozen_string_literal: true

# == Schema Information
#
# Table name: leaves
#
#  id               :integer          not null, primary key
#  from_date        :date
#  till_date        :date
#  reason           :string
#  response_message :string
#  status           :integer          default("pending")
#  leave_type       :string
#  user_id          :integer
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#
class Leave < ApplicationRecord
  enum status: %i[pending accepted rejected]

  validates :status, inclusion: { in: statuses.keys }
  validates :from_date, :till_date, presence: true
  validates :leave_type, presence: true
  # validates :from_date, date: { after_or_equal_to: Proc.new{Date.today}, message: 'Start date can not be before today'}
  validates :till_date, date: { after_or_equal_to: :from_date, message: 'End date should be greater then start date' }
  validate  :date_overlap, on: :create

  belongs_to :user, optional: true
  has_one :company, through: :user

  def is_leave_owner?
    user == user.is_consultant?
  end

  private

  def date_overlap
    if check_dates_overlap?
      errors.add(:base, 'Leave already present in that time span!')
      false
    else
      true
    end
  end

  def check_dates_overlap?
    user.leaves.all.each do |t|
      if from_date.between?(t.from_date, t.till_date)
        return true
      elsif till_date.between?(t.from_date, t.till_date)
        return true
      end
    end
    false
  end
end
