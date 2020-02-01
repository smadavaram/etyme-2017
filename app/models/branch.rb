# frozen_string_literal: true

class Branch < ActiveRecord::Base
  belongs_to :company
end
