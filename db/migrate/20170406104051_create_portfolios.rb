class CreatePortfolios < ActiveRecord::Migration[4.2]
  def change
    create_table :portfolios do |t|
      t.string   :name
      t.text     :description
      t.string   :cover_photo
      t.references :portfolioable, polymorphic: true
      t.timestamps null: false
    end
  end
end
