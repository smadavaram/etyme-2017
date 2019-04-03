class AddSocialMediaLinkFieldInCandidate < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates, :facebook_url, :string, default: nil
    add_column :candidates, :twitter_url, :string, default: nil
    add_column :candidates, :linkedin_url, :string, default: nil
    add_column :candidates, :skypeid, :string, default: nil
    add_column :candidates, :gtalk_url, :string, default: nil
  end
end
