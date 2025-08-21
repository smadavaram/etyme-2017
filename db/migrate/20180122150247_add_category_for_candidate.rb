class AddCategoryForCandidate < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :candidates, :category, :string
    add_column :candidates, :subcategory, :string
    add_column :candidates, :dept_name, :string
    add_column :candidates, :industry_name, :string
  end
end