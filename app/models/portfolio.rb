# frozen_string_literal: true

class Portfolio < ApplicationRecord
  belongs_to :portfolioable, polymorphic: :true

  validates :cover_photo, presence: :true
  validates :name, presence: :true
  validates :description, presence: :true
end
