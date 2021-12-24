# frozen_string_literal: true

# == Schema Information
#
# Table name: statuses
#
#  id              :integer          not null, primary key
#  statusable_type :string
#  statusable_id   :integer
#  user_id         :integer
#  note            :string
#  status_type     :integer
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
class Status < ApplicationRecord
  belongs_to :statusable, polymorphic: :true
  belongs_to :user, optional: true
  validates :status_type, presence: :true
  validates :note, presence: :true
  alias_attribute :created_by, :user
  enum status_type: %i[Follow_Up Callback Not_responding Active Archived]
end
