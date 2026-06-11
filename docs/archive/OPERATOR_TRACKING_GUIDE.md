# 📊 OPERATOR PERFORMANCE TRACKING - SETUP GUIDE

## STEP 1: Run SQL to Create Tables

**File:** `OPERATOR_TRACKING_MINIMAL.sql`

### What to do:
1. Open **Supabase SQL Editor**
2. **CLEAR** all text in editor
3. Open **`OPERATOR_TRACKING_MINIMAL.sql`**
4. Copy **all 112 lines**
5. Paste into SQL Editor
6. Click **Run**

### What this creates:
✅ **3 new tables:**
- `operator_performance_metrics` - Overall operator stats (production, safety, quality, cost)
- `operator_skills` - Proficiency by work type (wall saw, core drill, etc.)
- `operator_job_history` - Individual job records for analytics

✅ **6 indexes** for fast queries
✅ **Permissions** for authenticated users

### Expected result:
```
SUCCESS! Operator performance tracking tables created!
```

---

## What Data Will Be Tracked:

### 📈 **Production Metrics**
- Total jobs completed
- Total linear feet cut
- Total hours worked
- **Average linear feet per hour** (productivity rate)

### 🦺 **Safety Metrics**
- Safety incidents count
- Safety score (out of 100)
- Days since last incident

### ⭐ **Quality Metrics**
- Customer satisfaction average (1-5 stars)
- Rework incidents
- Success rate by work type

### 💰 **Cost Metrics**
- Jobs on budget vs over budget
- Average cost variance %

### 🛠️ **Skills Tracking**
- Proficiency level (1-5: Beginner → Master)
- Jobs completed per work type
- Productivity by work type
- Customer ratings by work type

---

## Next Steps After SQL:

Once tables are created, we'll add:
1. **Auto-calculation triggers** (like we did for PDF versioning)
2. **Operator profile page** to view stats
3. **Admin analytics dashboard** to compare operators
4. **Smart recommendation engine** for dispatch

---

## 🚨 IMPORTANT

- Run **ONLY** this SQL file for now
- Don't skip to other steps yet
- Let me know when you see the SUCCESS message
- Then we'll add the next layer

