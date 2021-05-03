class CreateCandidatePortfolioImages < ActiveRecord::Migration[5.1]
  def self.up
    create_table :candidate_portfolio_images do |t|
      t.belongs_to :candidate
      t.string :image_url

      t.timestamps
    end
  end
  def self.down
    drop_table :candidate_portfolio_images
  end  
end
