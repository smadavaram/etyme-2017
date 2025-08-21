# frozen_string_literal: true

# == Schema Information
#
# Table name: roles
#
#  id         :integer          not null, primary key
#  name       :string
#  company_id :integer
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class Role < ApplicationRecord
  has_and_belongs_to_many :permissions
  has_and_belongs_to_many :users
  belongs_to :company, optional: true

  validates :name, presence: true
end
