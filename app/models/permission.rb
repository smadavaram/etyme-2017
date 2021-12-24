# frozen_string_literal: true

# == Schema Information
#
# Table name: permissions
#
#  id         :integer          not null, primary key
#  name       :string
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class Permission < ApplicationRecord
  has_and_belongs_to_many :roles

  validates_uniqueness_of :name
  validates :name, presence: true
end
