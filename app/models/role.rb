# frozen_string_literal: true

class Role < ApplicationRecord
  has_and_belongs_to_many :permissions
  has_and_belongs_to_many :users
  belongs_to :company, optional: true

  validates :name, presence: true
end
