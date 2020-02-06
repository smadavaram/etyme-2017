# frozen_string_literal: true

class Holiday < ApplicationRecord
  validates_date :date
  belongs_to :company
end
