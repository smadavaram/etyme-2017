class ShareLinkPreview < ApplicationRecord
  belongs_to :company
  belongs_to :user
  before_create :add_uniq_key

  def add_uniq_key
    loop do
      self.key = SecureRandom.hex(6) # Generate a random string of 12 characters
      break unless ShareLinkPreview.exists?(key: self.key) # Check if the key is already in use
    end
  end
end
