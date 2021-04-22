class CreateCandidateSocialMedia < ActiveRecord::Migration[5.1]
  def self.up
    create_table :candidate_social_media do |t|
      t.belongs_to :candidate
      t.string :social_media_name
      t.text :social_media_url
  
      t.timestamps
    end
  end
  def self.down
    drop_table :candidate_social_media
  end
end