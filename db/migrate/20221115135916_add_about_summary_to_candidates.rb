class AddAboutSummaryToCandidates < ActiveRecord::Migration[5.2]
  def change
    add_column :candidates, :about_summary, :text
  end
end
